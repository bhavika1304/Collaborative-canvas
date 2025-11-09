/**
 * Manages user lists and assigned colors for each room.
 */
const rooms = new Map(); // Map<roomId, Map<userId, { color: string }>>

// A pool of distinguishable colors for users
const USER_COLORS = [
  '#FF5733', '#33FF57', '#3357FF', '#FF33A1', '#A133FF',
  '#33FFF6', '#F6FF33', '#FF8C33', '#8C33FF', '#33FF8C',
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8',
  '#F7DC6F', '#BB8FCE', '#85C1E2', '#F8B739', '#52B788'
];

class RoomManager {
  /**
   * Gets or creates a room.
   * @param {string} roomId
   * @returns {Map<string, {color: string}>}
   */
  _getRoom(roomId) {
    if (!roomId || typeof roomId !== 'string') {
      throw new Error('Invalid roomId');
    }
    
    if (!rooms.has(roomId)) {
      rooms.set(roomId, new Map());
    }
    return rooms.get(roomId);
  }

  /**
   * Adds a user to a room and assigns them a color.
   * @param {string} roomId
   * @param {string} userId
   * @returns {{color: string, users: Array}}
   */
  addUser(roomId, userId) {
    if (!userId || typeof userId !== 'string') {
      throw new Error('Invalid userId');
    }
    
    const room = this._getRoom(roomId);
    
    // If user already exists, return their existing color
    if (room.has(userId)) {
      return { color: room.get(userId).color, users: this.getUsers(roomId) };
    }
    
    const color = USER_COLORS[room.size % USER_COLORS.length];
    room.set(userId, { color });
    
    return { color, users: this.getUsers(roomId) };
  }

  /**
   * Removes a user from a room.
   * @param {string} roomId
   * @param {string} userId
   */
  removeUser(roomId, userId) {
    const room = this._getRoom(roomId);
    room.delete(userId);
    
    // Clean up empty rooms
    if (room.size === 0) {
      rooms.delete(roomId);
    }
  }

  /**
   * Gets a list of all users in a room with their data.
   * @param {string} roomId
   * @returns {Array<{id: string, color: string}>}
   */
  getUsers(roomId) {
    const room = this._getRoom(roomId);
    // Convert Map entries to an array of objects
    return Array.from(room.entries()).map(([id, data]) => ({
      id,
      color: data.color,
    }));
  }

  /**
   * Gets the number of users in a room.
   * @param {string} roomId
   * @returns {number}
   */
  getUserCount(roomId) {
    if (!rooms.has(roomId)) return 0;
    return rooms.get(roomId).size;
  }

  /**
   * Checks if a user exists in a room.
   * @param {string} roomId
   * @param {string} userId
   * @returns {boolean}
   */
  hasUser(roomId, userId) {
    if (!rooms.has(roomId)) return false;
    return rooms.get(roomId).has(userId);
  }

  /**
   * Gets all active room IDs.
   * @returns {Array<string>}
   */
  getRoomIds() {
    return Array.from(rooms.keys());
  }
}

// Export a singleton instance
module.exports = new RoomManager();