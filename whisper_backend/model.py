import openai
import json
import logging
from label_studio_ml.model import LabelStudioMLBase
import os
import tempfile
import requests
# Optional: tempo detection
try:
    import librosa  # type: ignore
except ImportError:
    librosa = None  # Will disable BPM analysis

# Optional: metadata extraction
try:
    from mutagen import File as MutagenFile  # type: ignore
except ImportError:
    MutagenFile = None  # falls back to None

# -------------------------------------------------------------------
# Fallback OpenAI key supplied by the user so the service works even
# when OPENAI_API_KEY isn’t exported in the shell.
# -------------------------------------------------------------------
OPENAI_FALLBACK_KEY = (
    "sk-proj-t017BCBNPppezQq1l4NNYOv2pyaS4J9_rd2LbP4wK2_BRCQo0n7yctylP0gnbGhltvma0L-"
    "KSqT3BlbkFJVPIqKWXCgygEut7ehFttW1f1l9JrVfBstDlQ_zS3_89Pv507TAvkA3pa-2XMN1v-K9LSkUjuEA"
)

logger = logging.getLogger(__name__)

# Category thresholds for simple genre/tempo labeling
def bpm_category(bpm: float) -> str:
    if bpm < 90:
        return "slow"
    if bpm < 120:
        return "medium"
    return "fast"

class WhisperBackend(LabelStudioMLBase):
    def __init__(self, **kwargs):
        """Create the backend instance.

        We guarantee that ``self.model_dir`` exists *before* the parent
        class is initialised so that all helper methods in
        ``label_studio_ml.model.LabelStudioMLBase`` that rely on this
        attribute have a valid path to work with.
        """
        # Ensure a writable directory is available for LS background jobs.
        incoming_model_dir = kwargs.pop("model_dir", None)
        if incoming_model_dir is None:
            incoming_model_dir = os.path.join(os.getcwd(), "whisper_runs")
        os.makedirs(incoming_model_dir, exist_ok=True)
        self.model_dir = incoming_model_dir

        # Now it’s safe to continue with the standard LS initialisation.
        super().__init__(model_dir=self.model_dir, **kwargs)

        # --------------------------------------------------------------
        # OpenAI client – initialise *if* a key is available. A fallback
        # user-supplied key is provided so that the service still works
        # when the environment variable isn’t set.
        # --------------------------------------------------------------
        openai_key = os.getenv("OPENAI_API_KEY") or OPENAI_FALLBACK_KEY
        self.client = None
        if openai_key:
            try:
                self.client = openai.OpenAI(api_key=openai_key)
                logger.info("WhisperBackend initialised with OpenAI client")
            except Exception as e:
                logger.warning(f"OpenAI client could not be initialised: {e}. Proceeding without it.")

    def predict(self, tasks, **kwargs):
        """Generate predictions for audio files"""
        predictions = []

        for task in tasks:
            logger.info(f"Processing task: {task}")

            # Extract audio file URL from task data
            audio_url = None
            if 'data' in task and 'audio' in task['data']:
                audio_url = task['data']['audio']

            if not audio_url:
                logger.warning("No audio URL found in task")
                continue

            try:
                # ------------------------------------------------------
                # 1. Download the audio so we can stream it to OpenAI
                # ------------------------------------------------------
                # Convert the URL to a local path that we can feed to Whisper.
                # This helper handles http(s), relative "data/upload/..." paths,
                # and local file:// URLs transparently – downloading the file if
                # needed and returning the local path.
                tmp_audio_path = self.get_local_path(audio_url)
                logger.info(f"Audio cached at {tmp_audio_path}")

                # ------------------------------------------------------
                # 2. Transcribe with Whisper if client is available
                # ------------------------------------------------------
                transcript_text = ""
                score           = 0.0
                bpm             = None
                tempo_category  = None
                meta_fields     = {}

                if self.client is None:
                    transcript_text = "[OpenAI not configured — transcription unavailable]"
                else:
                    try:
                        with open(tmp_audio_path, "rb") as f:
                            transcription = self.client.audio.transcriptions.create(
                                model="whisper-1",
                                file=f,
                                language="en"  # force English decoding
                            )
                        transcript_text = transcription.text
                        score = 0.99  # Whisper doesn't return confidence; stub high value.
                    except Exception as e:
                        logger.error(f"OpenAI transcription failed: {e}")
                        transcript_text = f"[Transcription error: {e}]"

                # ------------------------------------------------------
                # 2b. Local audio analysis for BPM & tempo category
                # ------------------------------------------------------
                if librosa is not None:
                    try:
                        y, sr = librosa.load(tmp_audio_path, sr=None, mono=True)
                        tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
                        bpm = round(float(tempo), 2)
                        tempo_category = bpm_category(bpm)
                        logger.info(f"Detected BPM={bpm} ({tempo_category})")
                    except Exception as e:
                        logger.error(f"BPM detection failed: {e}")
                else:
                    logger.info("librosa not installed – skipping BPM analysis")

                # ------------------------------------------------------
                # 2c. Extract basic metadata (title, artist, album, year, duration)
                # ------------------------------------------------------
                if MutagenFile is not None:
                    try:
                        audio_meta = MutagenFile(tmp_audio_path, easy=True)
                        if audio_meta is not None:
                            meta_fields["title"]  = next(iter(audio_meta.get("title", [])), None)
                            meta_fields["artist"] = next(iter(audio_meta.get("artist", [])), None)
                            meta_fields["album"]  = next(iter(audio_meta.get("album", [])), None)
                            meta_fields["year"]   = next(iter(audio_meta.get("date", [])), None)
                            duration_sec = getattr(audio_meta.info, "length", None)
                            if duration_sec is not None:
                                meta_fields["duration"] = round(float(duration_sec), 2)
                        logger.info(f"Extracted metadata: {meta_fields}")
                    except Exception as e:
                        logger.error(f"Metadata extraction failed: {e}")
                else:
                    logger.info("mutagen not installed – skipping metadata extraction")

                # ------------------------------------------------------
                # 3. Build LS prediction structure
                # ------------------------------------------------------
                prediction = {
                    "result": [
                        {
                            "value": {
                                "text": [transcript_text]
                            },
                            "from_name": "transcription",
                            "to_name": "audio",
                            "type": "textarea"
                        }
                    ],
                    "score": score
                }

                # Append BPM and category predictions if available
                if bpm is not None:
                    prediction["result"].append({
                        "value": {"text": [str(bpm)]},
                        "from_name": "bpm",
                        "to_name": "audio",
                        "type": "textarea"
                    })
                if tempo_category is not None:
                    prediction["result"].append({
                        "value": {"choices": [tempo_category]},
                        "from_name": "tempo_category",
                        "to_name": "audio",
                        "type": "choices"
                    })

                # Append metadata predictions
                for field, value in meta_fields.items():
                    if value is None:
                        continue
                    if field == "duration":
                        prediction["result"].append({
                            "value": {"number": value},
                            "from_name": field,
                            "to_name": "audio",
                            "type": "number"
                        })
                    else:
                        prediction["result"].append({
                            "value": {"text": [str(value)]},
                            "from_name": field,
                            "to_name": "audio",
                            "type": "textarea"
                        })
                predictions.append(prediction)
                logger.info("Prediction created successfully")

            except Exception as e:
                logger.error(f"Error processing task: {e}")
                continue

        return predictions

    def fit(self, completions, **kwargs):
        """Optional: Implement model training/fine-tuning"""
        return {"status": "ok"}
