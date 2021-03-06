FROM node:lts-alpine3.10 as base

LABEL org.opencontainers.image.source https://github.com/Trinovantes/MAL-Cover-CSS

ARG BUILD_ENV=production
ENV BUILD_ENV=${BUILD_ENV}
ENV NODE_ENV=${BUILD_ENV}

# -----------------------------------------------------------------------------
FROM base AS builder
# -----------------------------------------------------------------------------

WORKDIR /app

# Need to override NODE_ENV for 'yarn install' so that yarn will install devDependencies for building the app
COPY yarn.lock package.json ./
COPY node_modules/          ./node_modules/
RUN NODE_ENV=development yarn install

COPY tsconfig.json  ./
COPY build/         ./build/
COPY src/           ./src/

RUN yarn buildCron

RUN sh -c "\
    if [ ${BUILD_ENV} = 'development' ]; then\
        echo 'Skipping yarn install --production because BUILD_ENV=${BUILD_ENV}'; \
    else \
        yarn install --production; \
    fi"

# -----------------------------------------------------------------------------
FROM base
# -----------------------------------------------------------------------------

WORKDIR /app

COPY --from=builder /app/dist/                        ./dist/
COPY --from=builder /app/node_modules/                ./node_modules/
COPY --from=builder /app/yarn.lock  /app/package.json ./

RUN sh -c "echo '11 * * * * cd /app && yarn runScraper' >> /etc/crontabs/root"

CMD sh -c " \
    if [ ${BUILD_ENV} = 'development' ]; then \
        yarn debugScraper; \
    else \
        crond -f; \
    fi"
