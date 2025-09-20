# Frontend Dockerfile for React/Vite Application
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
# Set environment variable for Docker deployment
ENV VITE_API_URL=http://localhost:3001/api/v1

COPY . .

# Build the application
RUN npm run build

# Use nginx to serve the built application
FROM nginx:alpine

# Copy built files from previous stage
COPY --from=0 /app/dist /usr/share/nginx/html

# Copy nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port 3001
EXPOSE 3001

# Start nginx
CMD ["nginx", "-g", "daemon off;"]