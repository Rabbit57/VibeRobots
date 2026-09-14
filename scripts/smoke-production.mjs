const origin = process.env.VIBE_ROBOTS_ORIGIN ?? 'https://vibe-robots.ailocalops.com';

async function readJson(response, label) {
  const body = await response.text();

  try {
    return JSON.parse(body);
  } catch {
    const contentType = response.headers.get('content-type') ?? 'unknown content type';
    throw new Error(`${label} returned ${response.status} (${contentType}): ${body.slice(0, 160)}`);
  }
}

const home = await fetch(`${origin}/`);
if (!home.ok || !(await home.text()).includes('Vibe Robots')) {
  throw new Error(`Production home smoke test failed (${home.status}).`);
}

const room = await fetch(`${origin}/api/rooms`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ displayName: 'Smoke Test', robotId: 'hammer-bot', mode: 'multiplayer' }),
});
const payload = await readJson(room, 'Production room creation');
if (room.status !== 201 || !/^[A-Z0-9]{10}$/.test(payload.code) || !payload.seatToken || payload.view?.public?.roomCode !== payload.code) {
  throw new Error(`Production room smoke test failed (${room.status}).`);
}

const metadata = await fetch(`${origin}/api/rooms/${payload.code}`);
const publicRoom = await readJson(metadata, 'Production room metadata');
if (!metadata.ok || publicRoom.roomCode !== payload.code || JSON.stringify(publicRoom).includes(payload.seatToken) || 'hands' in publicRoom) {
  throw new Error('Production metadata redaction smoke test failed.');
}

console.log(`Production smoke test passed for ${origin} and room ${payload.code}.`);
