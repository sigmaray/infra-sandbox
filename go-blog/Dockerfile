FROM golang:alpine AS builder

# Install build dependencies for go-sqlite3
RUN apk add --no-cache gcc musl-dev

WORKDIR /app

# Copy go.mod and go.sum
COPY go.mod go.sum ./
RUN go mod download

# Copy source code
COPY . .

# Build the application
RUN CGO_ENABLED=1 GOOS=linux go build -o blog .

FROM alpine:latest

WORKDIR /app

# Install sqlite libraries
RUN apk add --no-cache sqlite-libs tzdata

# Copy the binary from the builder
COPY --from=builder /app/blog .

# Create a directory for the database
RUN mkdir -p /app/data

# Expose port
EXPOSE 8083

# Run the application
CMD ["./blog"]
