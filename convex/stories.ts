import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getAuthenticatedUser } from "./users";

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

/** Creates a 24-hour story backed by Convex storage. */
export const createStory = mutation({
  args: {
    storageId: v.id("_storage"),
    caption: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const currentUser = await getAuthenticatedUser(ctx);

    const imageUrl = await ctx.storage.getUrl(args.storageId);
    if (!imageUrl) throw new ConvexError("Story image not found");

    const trimmedCaption = args.caption?.trim();

    return await ctx.db.insert("stories", {
      userId: currentUser._id,
      imageUrl,
      storageId: args.storageId,
      caption: trimmedCaption ? trimmedCaption : undefined,
      expiresAt: Date.now() + TWENTY_FOUR_HOURS_MS,
    });
  },
});

/** Lists all users with their active (non-expired) 24-hour stories and view status. */
export const getActiveStories = query({
  handler: async (ctx) => {
    const currentUser = await getAuthenticatedUser(ctx);
    const now = Date.now();

    const [users, activeStories] = await Promise.all([
      ctx.db.query("users").collect(),
      ctx.db
        .query("stories")
        .withIndex("by_expires", (q) => q.gt("expiresAt", now))
        .collect(),
    ]);

    const userMap = new Map(users.map((u) => [u._id as string, u]));
    const storiesByUser = new Map<string, typeof activeStories>();

    for (const story of activeStories) {
      const key = story.userId as string;
      const list = storiesByUser.get(key) ?? [];
      list.push(story);
      storiesByUser.set(key, list);
    }

    const groups = await Promise.all(
      users.map(async (user) => {
        const userStories = (storiesByUser.get(user._id as string) ?? []).sort(
          (a, b) => a._creationTime - b._creationTime
        );

        const isCurrentUser = user._id === currentUser._id;

        const hydratedStories = await Promise.all(
          userStories.map(async (story) => {
            const viewRecord = await ctx.db
              .query("storyViews")
              .withIndex("by_story_and_viewer", (q) =>
                q.eq("storyId", story._id).eq("viewerId", currentUser._id)
              )
              .first();

            let viewers: {
              _id: string;
              username: string;
              fullname: string;
              image: string;
              viewedAt: number;
            }[] = [];

            if (isCurrentUser) {
              const allViews = await ctx.db
                .query("storyViews")
                .withIndex("by_story", (q) => q.eq("storyId", story._id))
                .collect();

              viewers = allViews
                .sort((a, b) => b.viewedAt - a.viewedAt)
                .map((view) => {
                  const viewer = userMap.get(view.viewerId as string);
                  if (!viewer) return null;
                  return {
                    _id: viewer._id,
                    username: viewer.username,
                    fullname: viewer.fullname,
                    image: viewer.image,
                    viewedAt: view.viewedAt,
                  };
                })
                .filter((v): v is NonNullable<typeof v> => v !== null);
            }

            return {
              _id: story._id,
              imageUrl: story.imageUrl,
              caption: story.caption,
              _creationTime: story._creationTime,
              expiresAt: story.expiresAt,
              isViewed: isCurrentUser ? true : !!viewRecord,
              viewsCount: viewers.length,
              viewers,
            };
          })
        );

        const hasStory = hydratedStories.length > 0;
        const hasUnseenStory = isCurrentUser
          ? hasStory
          : hydratedStories.some((s) => !s.isViewed);

        return {
          _id: user._id,
          username: user.username,
          fullname: user.fullname,
          image: user.image,
          isCurrentUser,
          hasStory,
          hasUnseenStory,
          stories: hydratedStories,
        };
      })
    );

    // Order: current user first, then users with unseen stories, then seen stories, then others.
    return groups.sort((a, b) => {
      if (a.isCurrentUser) return -1;
      if (b.isCurrentUser) return 1;
      const rank = (g: typeof a) =>
        g.hasStory ? (g.hasUnseenStory ? 0 : 1) : 2;
      return rank(a) - rank(b);
    });
  },
});

/** Records that the current user viewed a story. */
export const markStoryViewed = mutation({
  args: { storyId: v.id("stories") },
  handler: async (ctx, args) => {
    const currentUser = await getAuthenticatedUser(ctx);
    const story = await ctx.db.get(args.storyId);
    if (!story || story.userId === currentUser._id) return;

    const existing = await ctx.db
      .query("storyViews")
      .withIndex("by_story_and_viewer", (q) =>
        q.eq("storyId", args.storyId).eq("viewerId", currentUser._id)
      )
      .first();

    if (!existing) {
      await ctx.db.insert("storyViews", {
        storyId: args.storyId,
        viewerId: currentUser._id,
        viewedAt: Date.now(),
      });
    }
  },
});

/** Deletes a story owned by the authenticated user along with its views and storage file. */
export const deleteStory = mutation({
  args: { storyId: v.id("stories") },
  handler: async (ctx, args) => {
    const currentUser = await getAuthenticatedUser(ctx);
    const story = await ctx.db.get(args.storyId);
    if (!story) throw new ConvexError("Story not found");
    if (story.userId !== currentUser._id) {
      throw new ConvexError("Not authorized to delete this story");
    }

    const views = await ctx.db
      .query("storyViews")
      .withIndex("by_story", (q) => q.eq("storyId", args.storyId))
      .collect();

    await Promise.all(views.map((view) => ctx.db.delete(view._id)));
    await ctx.storage.delete(story.storageId);
    await ctx.db.delete(args.storyId);
  },
});
