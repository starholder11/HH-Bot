FROM --platform=linux/amd64 public.ecr.aws/lambda/nodejs:18

# Install system dependencies
RUN yum update -y && \
    yum install -y tar xz wget && \
    yum clean all

# Download and install static FFmpeg binaries
RUN cd /tmp && \
    wget -q https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz && \
    tar xf ffmpeg-release-amd64-static.tar.xz && \
    mv ffmpeg-*-amd64-static/ffmpeg /usr/local/bin/ && \
    mv ffmpeg-*-amd64-static/ffprobe /usr/local/bin/ && \
    chmod +x /usr/local/bin/ffmpeg /usr/local/bin/ffprobe && \
    rm -rf /tmp/*

# Set environment variables
ENV FFMPEG_PATH="/usr/local/bin/ffmpeg"
ENV FFPROBE_PATH="/usr/local/bin/ffprobe"

# Copy package files
COPY package*.json ${LAMBDA_TASK_ROOT}/

# Install dependencies
ENV NODE_ENV=production
RUN npm ci --omit=dev

# Copy function code
COPY index.js ${LAMBDA_TASK_ROOT}/

# Set the CMD to your handler
CMD [ "index.handler" ]
