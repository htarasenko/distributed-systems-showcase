# Use the official K6 image
FROM grafana/k6:latest

# Set working directory
WORKDIR /scripts

# Copy test scripts
COPY script.js .

# Set default command
CMD ["run", "script.js"]
