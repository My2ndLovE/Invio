# Frontend (Deno Fresh) production image
FROM denoland/deno:debian

WORKDIR /app

# Copy frontend source
COPY . /app

# Ensure VERSION is available in the runtime image. Prefer copying the file from the
# build context (expected to be synced from the repository root); fall back to the
# APP_VERSION build arg when the file is absent.
ARG APP_VERSION=unknown
RUN if [ -f /app/VERSION ]; then \
      printf "%s" "$(sed -e 's/\r$//' /app/VERSION)" > /app/VERSION; \
    else \
      printf "%s" "${APP_VERSION}" > /app/VERSION; \
    fi

# Install npm dependencies for Fresh 2.2.0
RUN deno install

# Cache imports (update to use vite.config.ts instead of dev.ts)
RUN deno cache main.ts vite.config.ts

# Build with platform-specific handling
# Skip build for ARM64 in emulation (causes QEMU issues)
# Fresh can run without pre-build in production mode
RUN if [ "$(uname -m)" = "x86_64" ]; then \
      deno task build; \
    else \
      echo "Skipping build on ARM64 - will build on first request"; \
    fi

# Default env; BACKEND_URL should point to backend service in compose
ENV PORT=8000 \
    BACKEND_URL=http://backend:3000

EXPOSE 8000

# Run the production preview server
CMD ["sh", "-c", "deno serve -A --port=$PORT _fresh/server.js"]