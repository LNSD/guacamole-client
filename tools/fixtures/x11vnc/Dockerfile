FROM ubuntu:20.04

RUN apt-get update && \
  apt-get install -y xvfb x11vnc fluxbox wmctrl x11-apps && \
  rm -rf /var/lib/apt/lists/*

COPY entrypoint.sh /usr/bin
ENTRYPOINT ["entrypoint.sh"]