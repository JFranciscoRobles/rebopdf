// The API of @rebopdf/collab in the browser: an editor in a room, and what
// is sent between the people in it.

export { type CollabEditor, joinRoom, type RoomOptions, roomAddress, type Session, shareEditor } from './client';
export { applyOps, describeOp, diffPdfs, type Entry, type Op, type Peer, PREFIX, type Role } from './protocol';
