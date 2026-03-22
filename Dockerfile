FROM node:22-slim
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev 2>/dev/null || true
COPY bin/ ./bin/
COPY src/ ./src/
CMD ["node", "bin/cli.mjs", "--mcp"]
