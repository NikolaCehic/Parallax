FROM node:22-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
COPY python ./python
COPY fixtures ./fixtures

RUN npm run build --silent

ENV NODE_ENV=production
ENV PARALLAX_AUDIT_DIR=/data/audits
ENV PARALLAX_HOST=0.0.0.0
ENV PARALLAX_PORT=8787

VOLUME ["/data"]
EXPOSE 8787

CMD ["sh", "-c", "node dist/src/cli/parallax.js beta-serve --audit-dir ${PARALLAX_AUDIT_DIR} --host ${PARALLAX_HOST} --port ${PARALLAX_PORT}"]
