# syntax = docker/dockerfile:1.2

###### BUILDER    ########################################################
#FROM node:12-alpine as BUILDER
#
#WORKDIR /usr/src
#
#COPY package.json ./
#COPY yarn.lock ./
#RUN --mount=type=cache,target=/root/.yarn YARN_CACHE_FOLDER=/root/.yarn yarn --frozen-lockfile
#

##### DEV Server ########################################################
FROM node:16

WORKDIR /usr/src/

#### Rust
#
## common packages
#RUN apt-get update && \
#    apt-get install --no-install-recommends -y \
#    ca-certificates curl file \
#    build-essential \
#    autoconf automake autotools-dev libtool xutils-dev && \
#    rm -rf /var/lib/apt/lists/*
#
#ENV SSL_VERSION=1.0.2u
#
#RUN curl https://www.openssl.org/source/openssl-$SSL_VERSION.tar.gz -O && \
#    tar -xzf openssl-$SSL_VERSION.tar.gz && \
#    cd openssl-$SSL_VERSION && ./config && make depend && make install && \
#    cd .. && rm -rf openssl-$SSL_VERSION*
#
#ENV OPENSSL_LIB_DIR=/usr/local/ssl/lib \
#    OPENSSL_INCLUDE_DIR=/usr/local/ssl/include \
#    OPENSSL_STATIC=1
#
## install toolchain
#RUN curl https://sh.rustup.rs -sSf | \
#    sh -s -- --default-toolchain stable -y
#
#ENV PATH=/root/.cargo/bin:$PATH

### SRC

RUN --mount=type=cache,target=/root/.yarn YARN_CACHE_FOLDER=/root/.yarn yarn --frozen-lockfile
#COPY --from=BUILDER node_modules ./node_modules

# Copy sources
COPY . ./

CMD ["yarn", "start"]
