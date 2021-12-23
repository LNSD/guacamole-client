#!/bin/bash
set -e

# Based on: http://www.richud.com/wiki/Ubuntu_Fluxbox_GUI_with_x11vnc_and_Xvfb
# Extracted from: https://medium.com/dot-debug/running-chrome-in-a-docker-container-a55e7f4da4a8

readonly G_LOG_I='[INFO]'
readonly G_LOG_W='[WARN]'
readonly G_LOG_E='[ERROR]'

launch_xvfb() {
    # Set defaults if the user did not specify envs.
    export DISPLAY=${XVFB_DISPLAY:-:0}
    local screen=${XVFB_SCREEN:-0}
    local resolution=${XVFB_RESOLUTION:-1920x1080x24}
    local timeout=${XVFB_TIMEOUT:-10}

    # Start and wait for either Xvfb to be fully up or we hit the timeout.
    Xvfb ${DISPLAY} -screen ${screen} ${resolution} > /dev/null 2>&1 &
    local loopCount=0
    until xdpyinfo -display ${DISPLAY} > /dev/null 2>&1
    do
        loopCount=$((loopCount+1))
        sleep 1
        if [ ${loopCount} -gt ${timeout} ]
        then
            echo "${G_LOG_E} xvfb failed to start."
            exit 1
        fi
    done
}

launch_window_manager() {
    local timeout=${XVFB_TIMEOUT:-10}

    # Start and wait for either fluxbox to be fully up or we hit the timeout.
    startfluxbox > /dev/null 2>&1 &
    local loopCount=0
    until wmctrl -m > /dev/null 2>&1
    do
        loopCount=$((loopCount+1))
        sleep 1
        if [ ${loopCount} -gt ${timeout} ]
        then
            echo "${G_LOG_E} fluxbox failed to start."
            exit 1
        fi
    done
}

generate_window_manager_conf() {
    mkdir -p $HOME/.fluxbox
    if [ ! -f $HOME/.fluxbox/apps ]; then
        echo '[app] (.*)'            > $HOME/.fluxbox/apps
        echo -e '\t[Deco]  {BORDER}' >> $HOME/.fluxbox/apps
        echo '[end]'                 >> $HOME/.fluxbox/apps
    fi
    if [ ! -f $HOME/.fluxbox/startup ] && command -v xcompmgr > /dev/null 2>&1; then
        echo '#!/bin/bash'  > $HOME/.fluxbox/startup
        echo 'xcompmgr &'   >> $HOME/.fluxbox/startup
        echo 'exec fluxbox' >> $HOME/.fluxbox/startup
    fi
}

run_vnc_server() {
    local passwordArgument='-nopw'

    if [ -n "${VNC_SERVER_PASSWORD}" ]
    then
        local passwordFilePath="${HOME}/x11vnc.pass"
        if ! x11vnc -storepasswd "${VNC_SERVER_PASSWORD}" "${passwordFilePath}"
        then
            echo "${G_LOG_E} Failed to store x11vnc password."
            exit 1
        fi
        passwordArgument=-"-rfbauth ${passwordFilePath}"
        echo "${G_LOG_W} The VNC server will ask for a password."
    else
        echo "${G_LOG_I} The VNC server will NOT ask for a password."
    fi

    x11vnc -display ${DISPLAY} -nevershared -forever ${passwordArgument} > /dev/null 2>&1 &
}

setup_display() {
		generate_window_manager_conf

    launch_xvfb
    launch_window_manager

    # Run only if VNC server is available
    if command -v x11vnc > /dev/null 2>&1; then
        run_vnc_server
    fi
}

setup_display && exec "$@"