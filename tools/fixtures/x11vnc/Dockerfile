FROM ubuntu:20.04

ENV DEBIAN_FRONTEND noninteractive
ENV HOME /root

RUN apt-get update && \
  apt-get install -y --force-yes --no-install-recommends gnupg

ADD google_linux_signing_key.pub /tmp/google_linux_signing_key.pub
RUN apt-key add /tmp/google_linux_signing_key.pub && \
  echo "deb http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google-chrome.list && \
  adduser --disabled-password --system chrome

RUN apt-get update && \
  apt-get install -y --force-yes --no-install-recommends \
    supervisor \
    xvfb x11vnc \
    pulseaudio \
    fluxbox \
    wmctrl \
    x11-apps \
    google-chrome-stable

RUN  apt-get autoclean && \
  apt-get autoremove && \
  rm -rf /var/lib/apt/lists/*

WORKDIR /

ADD default.pa /etc/pulse/default.pa
ADD fluxbox_init /etc/fluxbox_init
ADD master_preferences /opt/google/chrome/
ADD entrypoint.sh /usr/bin/
RUN chmod a+rx /usr/bin/entrypoint.sh

ADD supervisord.conf /

CMD ["/usr/bin/entrypoint.sh"]
