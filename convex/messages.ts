import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { getAuthenticatedUser } from "./users";

function orderParticipants(userA: Id<"users">, userB: Id<"users">): [Id<"users">, Id<"users">] {
  return userA < userB ? [userA, userB] : [userB, userA];
}

/** Returns an existing 1-on-1 conversation or creates a new one. */
export const getOrCreateConversation = mutation({
  args: { otherUserId: v.id("users") },
  handler: async (ctx, args) => {
    const currentUser = await getAuthenticatedUser(ctx);
    if (args.otherUserId === currentUser._id) {
      throw new ConvexError("Cannot start a conversation with yourself");
    }

    const otherUser = await ctx.db.get(args.otherUserId);
    if (!otherUser) throw new ConvexError("User not found");

    const [participantOneId, participantTwoId] = orderParticipants(
      currentUser._id,
      args.otherUserId
    );

    const existing = await ctx.db
      .query("conversations")
      .withIndex("by_participants", (q) =>
        q.eq("participantOneId", participantOneId).eq("participantTwoId", participantTwoId)
      )
      .first();

    if (existing) return existing._id;

    return await ctx.db.insert("conversations", {
      participantOneId,
      participantTwoId,
      lastMessageAt: Date.now(),
    });
  },
});

/** Lists all conversations for the authenticated user sorted by most recent activity. */
export const getConversations = query({
  handler: async (ctx) => {
    const currentUser = await getAuthenticatedUser(ctx);

    const [asOne, asTwo] = await Promise.all([
      ctx.db
        .query("conversations")
        .withIndex("by_participant_one", (q) => q.eq("participantOneId", currentUser._id))
        .collect(),
      ctx.db
        .query("conversations")
        .withIndex("by_participant_two", (q) => q.eq("participantTwoId", currentUser._id))
        .collect(),
    ]);

    const conversations = [...asOne, ...asTwo].sort(
      (a, b) => b.lastMessageAt - a.lastMessageAt
    );

    const unreadMessages = await ctx.db
      .query("messages")
      .withIndex("by_receiver_unread", (q) =>
        q.eq("receiverId", currentUser._id).eq("isRead", false)
      )
      .collect();

    const unreadByConversation = new Map<string, number>();
    for (const msg of unreadMessages) {
      const key = msg.conversationId as string;
      unreadByConversation.set(key, (unreadByConversation.get(key) ?? 0) + 1);
    }

    const hydrated = await Promise.all(
      conversations.map(async (conversation) => {
        const otherUserId =
          conversation.participantOneId === currentUser._id
            ? conversation.participantTwoId
            : conversation.participantOneId;

        const otherUser = await ctx.db.get(otherUserId);
        if (!otherUser) return null;

        return {
          ...conversation,
          otherUser: {
            _id: otherUser._id,
            username: otherUser.username,
            fullname: otherUser.fullname,
            image: otherUser.image,
          },
          unreadCount: unreadByConversation.get(conversation._id as string) ?? 0,
        };
      })
    );

    return hydrated.filter((item): item is NonNullable<typeof item> => item !== null);
  },
});

/** Returns conversation metadata and the other participant for the chat header. */
export const getConversationDetails = query({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    const currentUser = await getAuthenticatedUser(ctx);
    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation) return null;

    if (
      conversation.participantOneId !== currentUser._id &&
      conversation.participantTwoId !== currentUser._id
    ) {
      throw new ConvexError("Not authorized to view this conversation");
    }

    const otherUserId =
      conversation.participantOneId === currentUser._id
        ? conversation.participantTwoId
        : conversation.participantOneId;
    const otherUser = await ctx.db.get(otherUserId);
    if (!otherUser) return null;

    return {
      _id: conversation._id,
      currentUserId: currentUser._id,
      otherUser: {
        _id: otherUser._id,
        username: otherUser.username,
        fullname: otherUser.fullname,
        image: otherUser.image,
      },
    };
  },
});

/** Subscribes to all messages in a conversation in chronological order. */
export const getMessages = query({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    const currentUser = await getAuthenticatedUser(ctx);
    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation) return [];

    if (
      conversation.participantOneId !== currentUser._id &&
      conversation.participantTwoId !== currentUser._id
    ) {
      throw new ConvexError("Not authorized to view these messages");
    }

    return await ctx.db
      .query("messages")
      .withIndex("by_conversation", (q) => q.eq("conversationId", args.conversationId))
      .order("asc")
      .collect();
  },
});

/** Sends a real-time message and schedules a push notification to the recipient. */
export const sendMessage = mutation({
  args: {
    conversationId: v.id("conversations"),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const currentUser = await getAuthenticatedUser(ctx);
    const trimmed = args.content.trim();
    if (!trimmed) throw new ConvexError("Message cannot be empty");

    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation) throw new ConvexError("Conversation not found");

    if (
      conversation.participantOneId !== currentUser._id &&
      conversation.participantTwoId !== currentUser._id
    ) {
      throw new ConvexError("Not authorized to message in this conversation");
    }

    const receiverId =
      conversation.participantOneId === currentUser._id
        ? conversation.participantTwoId
        : conversation.participantOneId;

    const messageId = await ctx.db.insert("messages", {
      conversationId: args.conversationId,
      senderId: currentUser._id,
      receiverId,
      content: trimmed,
      isRead: false,
    });

    await ctx.db.patch(args.conversationId, {
      lastMessageText: trimmed,
      lastMessageSenderId: currentUser._id,
      lastMessageAt: Date.now(),
    });

    await ctx.scheduler.runAfter(0, internal.push.sendPushNotification, {
      receiverId,
      title: currentUser.username,
      body: trimmed,
      data: {
        type: "message",
        conversationId: args.conversationId,
        senderId: currentUser._id,
      },
    });

    return messageId;
  },
});

/** Marks all unread messages sent to the current user in a conversation as read. */
export const markMessagesAsRead = mutation({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    const currentUser = await getAuthenticatedUser(ctx);
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_conversation", (q) => q.eq("conversationId", args.conversationId))
      .collect();

    const unread = messages.filter(
      (msg) => msg.receiverId === currentUser._id && !msg.isRead
    );

    await Promise.all(unread.map((msg) => ctx.db.patch(msg._id, { isRead: true })));
  },
});

/** Returns total unread direct messages count for the authenticated user. */
export const getUnreadCount = query({
  handler: async (ctx) => {
    const currentUser = await getAuthenticatedUser(ctx);
    const unread = await ctx.db
      .query("messages")
      .withIndex("by_receiver_unread", (q) =>
        q.eq("receiverId", currentUser._id).eq("isRead", false)
      )
      .collect();

    return unread.length;
  },
});
