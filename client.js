/* ===== Client.js — API client ===== */
const API = {
  login(username, password) {
    return Server.login(username, password);
  },
  register(username, password) {
    return Server.register(username, password);
  },
  logout() {
    Server.logout();
  },
  getCurrentUser() {
    return Server.getUser();
  },

  // Communities
  getCommunities() {
    return Server.getCommunities();
  },
  getCommunity(name) {
    return Server.getCommunity(name);
  },
  createCommunity(name, desc) {
    return Server.createCommunity(name, desc);
  },
  joinCommunity(name) {
    return Server.joinCommunity(name);
  },

  // Posts
  getPosts(filter, community) {
    return Server.getPosts(filter, community);
  },
  getPost(id) {
    return Server.getPost(id);
  },
  createPost(title, content, community, image) {
    return Server.createPost(title, content, community, image);
  },
  votePost(id, type) {
    return Server.votePost(id, type);
  },

  // Comments
  addComment(postId, content, parentId) {
    return Server.addComment(postId, content, parentId);
  },
  voteComment(postId, commentId, type) {
    return Server.voteComment(postId, commentId, type);
  },

  // Search
  search(query) {
    return Server.search(query);
  },

  getUserCommunities() {
    return Server.getUserCommunities();
  }
};
