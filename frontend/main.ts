import { initHost } from './host';
import { initPlayer } from './player';

document.addEventListener("DOMContentLoaded", () => {
    const urlParams = new URLSearchParams(window.location.search);
    // Check if role is player
    if (urlParams.has('role') && urlParams.get('role') === 'player') {
        const playerView = document.getElementById('player-view');
        if (playerView) playerView.hidden = false;
        initPlayer();
    } else {
        // Default to host view
        const hostView = document.getElementById('host-view');
        if (hostView) hostView.hidden = false;
        initHost();
    }
});
