import os
import sys
from label_studio_ml.api import init_app

# Add current directory to Python path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from model import WhisperBackend
from flask import request, jsonify
from label_studio_ml import api as ls_api

# Create the Flask app
app = init_app(model_class=WhisperBackend)

# -------------------------------------------------------------------
# Monkey-patch the default _predict handler so it gracefully accepts
# both the old list-only payload and the new {"tasks": [...]} format.
# -------------------------------------------------------------------

_original_predict = ls_api._predict

def _predict_patched():
    data = request.get_json(force=True, silent=True)
    if isinstance(data, list):
        data = {'tasks': data}
        request._cached_json = (data, data)
    return _original_predict()

# Replace the view function in Flask’s mapping
app.view_functions['_predict'] = _predict_patched

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=9090)
    parser.add_argument('--host', type=str, default='127.0.0.1')
    # Allow users to toggle Flask debug mode explicitly.
    debug_group = parser.add_mutually_exclusive_group()
    debug_group.add_argument('--debug', dest='debug', action='store_true', help='Enable Flask debug mode')
    debug_group.add_argument('--no-debug', dest='debug', action='store_false', help='Disable Flask debug mode')
    parser.set_defaults(debug=False)
    args = parser.parse_args()

    app.run(host=args.host, port=args.port, debug=args.debug)
