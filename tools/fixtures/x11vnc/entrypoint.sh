#!/bin/sh
mkdir /home/chrome/.config
chown chrome:nogroup /home/chrome/.config

/usr/bin/supervisord -c /supervisord.conf
