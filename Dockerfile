FROM node:22-alpine

WORKDIR /app

# Install git
RUN apk add --no-cache git

# Copy package files
COPY package*.json ./

# Install dependencies WITHOUT running prepare scripts
RUN npm install --ignore-scripts

# Copy all source code
COPY . .

# Create necessary directories with proper permissions
RUN mkdir -p logs data && chmod 755 logs data

# Set environment
ENV NODE_ENV=production

# Run the tool with auto-start mode (skip CLI prompts)
CMD ["npm", "start", "--", "--auto", "--skip-check-update"]
