import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalQuery, mutation } from "./_generated/server";
import { getAuthenticatedUser } from "./users";

/** Saves or updates an Expo push token for the authenticated user's device. */
export const savePushToken = mutation({
  args: {
    token: v.string(),
    platform: v.string(),
  },
  handler: async (ctx, args) => {
    const currentUser = await getAuthenticatedUser(ctx);

    const existing = await ctx.db
      .query("pushTokens")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        userId: currentUser._id,
        platform: args.platform,
        updatedAt: Date.now(),
      });
      return existing._id;
    }

    return await ctx.db.insert("pushTokens", {
      userId: currentUser._id,
      token: args.token,
      platform: args.platform,
      updatedAt: Date.now(),
    });
  },
});

/** Removes an Expo push token (for example when signing out). */
export const removePushToken = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const currentUser = await getAuthenticatedUser(ctx);
    const existing = await ctx.db
      .query("pushTokens")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();

    if (existing && existing.userId === currentUser._id) {
      await ctx.db.delete(existing._id);
    }
  },
});

/** Internal lookup of push tokens registered to a recipient user. */
export const getUserPushTokens = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("pushTokens")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
  },
});

/** Sends an Expo push notification to all registered devices for a user. */
export const sendPushNotification = internalAction({
  args: {
    receiverId: v.id("users"),
    title: v.string(),
    body: v.string(),
    data: v.optional(
      v.object({
        type: v.string(),
        conversationId: v.optional(v.string()),
        senderId: v.optional(v.string()),
        postId: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const tokens = await ctx.runQuery(internal.push.getUserPushTokens, {
      userId: args.receiverId,
    });

    if (tokens.length === 0) return;

    const payloads = tokens.map((entry) => ({
      to: entry.token,
      sound: "default",
      title: args.title,
      body: args.body,
      data: args.data ?? {},
    }));

    try {
      const response = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Accept-encoding": "gzip, deflate",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payloads),
      });

      if (!response.ok) {
        console.error("Expo push API error:", response.status, await response.text());
      }
    } catch (error) {
      console.error("Failed to deliver push notification:", error);
    }
  },
});
