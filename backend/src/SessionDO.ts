import { DurableObject } from 'cloudflare:workers';
import type { Env, SessionRecord, Permission } from './types.js';
import { validateShareCode, getPermissions, extractShareCode, randomAlphanumeric } from './lib/auth.js';
import { getMeta, putMeta } from './lib/kv.js';

type WsAttachment =
  | { authenticated: false }
  | { authenticated: true; shareCode: string; permissions: Permission[] };

export class SessionDO extends DurableObject<Env> {
  private _session: SessionRecord | null | undefined = undefined;

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    // Strip /api/sessions/:id prefix when coming from the worker router
    const path = url.pathname.replace(/^\/api\/sessions\/[^/]+/, '') || '/';
    const method = request.method;

    if (request.headers.get('Upgrade') === 'websocket') {
      return this.handleWsUpgrade();
    }

    if (path === '/init'   && method === 'POST') return this.handleInit(request);
    if (path === '/join'   && method === 'POST') return this.handleJoin(request);
    if (path === '/sync'   && method === 'PUT')  return this.handleSyncPut(request);
    if (path === '/share-codes' && method === 'GET')  return this.handleListShareCodes(request);
    if (path === '/share-codes' && method === 'POST') return this.handleCreateShareCode(request);

    const revokeMatch = path.match(/^\/share-codes\/([A-Za-z0-9]+)$/);
    if (revokeMatch && method === 'DELETE') return this.handleRevokeShareCode(request, revokeMatch[1]);

    if ((path === '/' || path === '') && method === 'DELETE') return this.handleDelete(request);

    return new Response('Not found', { status: 404 });
  }

  async alarm(): Promise<void> {
    for (const ws of this.ctx.getWebSockets()) {
      try { ws.send(JSON.stringify({ type: 'session_deleted' })); } catch (_) { /* ws already closed */ }
      try { ws.close(1001, 'session_expired'); } catch (_) { /* ws already closed */ }
    }
    await this.ctx.storage.deleteAll();
    this._session = null;
    const meta = await getMeta(this.env.SESSIONS);
    await putMeta(this.env.SESSIONS, { ...meta, sessionCount: Math.max(0, meta.sessionCount - 1) });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    let data: { type: string; shareCode?: string };
    try {
      data = JSON.parse(typeof message === 'string' ? message : new TextDecoder().decode(message));
    } catch (_) {
      ws.close(1008, 'invalid_json');
      return;
    }

    const attachment = (ws.deserializeAttachment() ?? { authenticated: false }) as WsAttachment;

    if (!attachment.authenticated) {
      if (data.type !== 'auth' || !data.shareCode) {
        ws.close(1008, 'expected_auth');
        return;
      }
      const session = await this.load();
      if (!session) { ws.close(1008, 'session_not_found'); return; }
      const permissions = getPermissions(session, data.shareCode);
      if (!permissions) { ws.close(1008, 'forbidden'); return; }

      ws.serializeAttachment({ authenticated: true, shareCode: data.shareCode, permissions });
      ws.send(JSON.stringify({
        type: 'connected',
        encryptedData: session.encryptedData,
        version: session.version,
      }));
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    ws.close();
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    ws.close();
  }

  // ── Storage helpers ───────────────────────────────────────────────────────────

  private async load(): Promise<SessionRecord | null> {
    if (this._session !== undefined) return this._session;
    this._session = (await this.ctx.storage.get<SessionRecord>('session')) ?? null;
    return this._session;
  }

  private async store(session: SessionRecord): Promise<void> {
    this._session = session;
    await this.ctx.storage.put('session', session);
    await this.ctx.storage.setAlarm(Date.now() + 24 * 60 * 60 * 1000);
  }

  // ── WS helpers ────────────────────────────────────────────────────────────────

  private handleWsUpgrade(): Response {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  private broadcast(data: object, skipCode?: string): void {
    const msg = JSON.stringify(data);
    for (const ws of this.ctx.getWebSockets()) {
      const att = (ws.deserializeAttachment() ?? { authenticated: false }) as WsAttachment;
      if (att.authenticated && att.shareCode !== skipCode) {
        try { ws.send(msg); } catch (_) { /* ignore closed ws */ }
      }
    }
  }

  private closeRevoked(revokedCode: string): void {
    for (const ws of this.ctx.getWebSockets()) {
      const att = (ws.deserializeAttachment() ?? { authenticated: false }) as WsAttachment;
      if (att.authenticated && att.shareCode === revokedCode) {
        try { ws.send(JSON.stringify({ type: 'share_code_revoked' })); } catch (_) { /* ignore */ }
        try { ws.close(1008, 'share_code_revoked'); } catch (_) { /* ignore */ }
      }
    }
  }

  // ── Route handlers ────────────────────────────────────────────────────────────

  private async handleInit(request: Request): Promise<Response> {
    const session = (await request.json()) as SessionRecord;
    await this.store(session);
    return new Response(null, { status: 201 });
  }

  private async handleJoin(request: Request): Promise<Response> {
    const shareCode = extractShareCode(request.headers.get('Authorization') ?? undefined);
    if (!shareCode) return Response.json({ error: 'missing_share_code' }, { status: 401 });

    const session = await this.load();
    if (!session) return Response.json({ error: 'session_not_found' }, { status: 404 });

    const permissions = getPermissions(session, shareCode);
    if (!permissions) return Response.json({ error: 'invalid_share_code' }, { status: 403 });

    await this.store({ ...session, lastAccess: new Date().toISOString() });

    return Response.json({
      encryptedData: session.encryptedData,
      permissions,
      version: session.version,
      name: session.name ?? '',
    });
  }

  private async handleSyncPut(request: Request): Promise<Response> {
    const shareCode = extractShareCode(request.headers.get('Authorization') ?? undefined);
    if (!shareCode) {
      await request.body?.cancel();
      return Response.json({ error: 'missing_share_code' }, { status: 401 });
    }

    const session = await this.load();
    if (!session) {
      await request.body?.cancel();
      return Response.json({ error: 'session_not_found' }, { status: 404 });
    }

    const canEdit =
      validateShareCode(session, shareCode, 'edit_tasks') ||
      validateShareCode(session, shareCode, 'edit_notes') ||
      validateShareCode(session, shareCode, 'edit_budget');
    if (!canEdit) {
      await request.body?.cancel();
      return Response.json({ error: 'forbidden' }, { status: 403 });
    }

    const body = (await request.json()) as { encryptedData: string };

    if (!body.encryptedData) {
      return Response.json({ error: 'missing_fields' }, { status: 400 });
    }

    // DO serialises requests so writes are never concurrent — last writer wins
    const updated: SessionRecord = {
      ...session,
      version: session.version + 1,
      lastAccess: new Date().toISOString(),
      encryptedData: body.encryptedData,
    };

    await this.store(updated);

    // Broadcast to ALL connected clients, including the pusher's own WS connections.
    // Skipping by share code would block clients that opened the same link in a second
    // tab (same share code). The pusher's own tab handles the echo idempotently via
    // the _lastPushedJSON check in SyncStatus.js.
    this.broadcast(
      { type: 'sync', encryptedData: updated.encryptedData, version: updated.version },
    );

    return Response.json({ encryptedData: updated.encryptedData, version: updated.version });
  }

  private async handleListShareCodes(request: Request): Promise<Response> {
    const shareCode = extractShareCode(request.headers.get('Authorization') ?? undefined);
    if (!shareCode) return Response.json({ error: 'missing_share_code' }, { status: 401 });

    const session = await this.load();
    if (!session) return Response.json({ error: 'session_not_found' }, { status: 404 });

    if (!validateShareCode(session, shareCode, 'manage_share')) {
      return Response.json({ error: 'forbidden' }, { status: 403 });
    }

    const codes = Object.entries(session.shareCodes).map(([code, entry]) => ({
      shareCode: code,
      permissions: entry.permissions,
      createdAt: entry.createdAt,
    }));

    return Response.json({ shareCodes: codes });
  }

  private async handleCreateShareCode(request: Request): Promise<Response> {
    const shareCode = extractShareCode(request.headers.get('Authorization') ?? undefined);
    if (!shareCode) return Response.json({ error: 'missing_share_code' }, { status: 401 });

    const session = await this.load();
    if (!session) return Response.json({ error: 'session_not_found' }, { status: 404 });

    if (!validateShareCode(session, shareCode, 'manage_share')) {
      return Response.json({ error: 'forbidden' }, { status: 403 });
    }

    const body = (await request.json()) as { permissions: Permission[] };
    if (!Array.isArray(body.permissions) || body.permissions.length === 0) {
      return Response.json({ error: 'invalid_permissions' }, { status: 400 });
    }

    const newCode = randomAlphanumeric(16);
    const now = new Date().toISOString();

    await this.store({
      ...session,
      lastAccess: now,
      shareCodes: { ...session.shareCodes, [newCode]: { permissions: body.permissions, createdAt: now } },
    });

    return Response.json({ shareCode: newCode, permissions: body.permissions, createdAt: now }, { status: 201 });
  }

  private async handleRevokeShareCode(request: Request, codeToRevoke: string): Promise<Response> {
    const shareCode = extractShareCode(request.headers.get('Authorization') ?? undefined);
    if (!shareCode) return Response.json({ error: 'missing_share_code' }, { status: 401 });

    const session = await this.load();
    if (!session) return Response.json({ error: 'session_not_found' }, { status: 404 });

    if (!validateShareCode(session, shareCode, 'manage_share')) {
      return Response.json({ error: 'forbidden' }, { status: 403 });
    }

    if (codeToRevoke === shareCode) return Response.json({ error: 'cannot_revoke_own_code' }, { status: 400 });
    if (!session.shareCodes[codeToRevoke]) return Response.json({ error: 'share_code_not_found' }, { status: 404 });

    const updatedCodes = { ...session.shareCodes };
    delete updatedCodes[codeToRevoke];

    await this.store({ ...session, lastAccess: new Date().toISOString(), shareCodes: updatedCodes });

    this.closeRevoked(codeToRevoke);

    return new Response(null, { status: 204 });
  }

  private async handleDelete(request: Request): Promise<Response> {
    const shareCode = extractShareCode(request.headers.get('Authorization') ?? undefined);
    if (!shareCode) return Response.json({ error: 'missing_share_code' }, { status: 401 });

    const session = await this.load();
    if (!session) return Response.json({ error: 'session_not_found' }, { status: 404 });

    const permissions = getPermissions(session, shareCode);
    if (!permissions?.includes('manage_share')) return Response.json({ error: 'forbidden' }, { status: 403 });

    for (const ws of this.ctx.getWebSockets()) {
      try { ws.send(JSON.stringify({ type: 'session_deleted' })); } catch (_) { /* ignore */ }
      try { ws.close(1001, 'session_deleted'); } catch (_) { /* ignore */ }
    }

    await this.ctx.storage.deleteAll();
    this._session = null;

    return new Response(null, { status: 204 });
  }
}
