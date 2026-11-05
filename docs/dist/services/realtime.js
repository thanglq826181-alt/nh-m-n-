"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.subscribeRealtime = subscribeRealtime;
exports.publishRealtime = publishRealtime;
const clients = new Set();
function subscribeRealtime(response) {
    clients.add(response);
    return () => clients.delete(response);
}
function publishRealtime(event, payload) {
    const frame = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
    for (const client of clients) {
        if (client.writableEnded || client.destroyed) {
            clients.delete(client);
            continue;
        }
        try {
            client.write(frame);
        }
        catch {
            clients.delete(client);
        }
    }
}
