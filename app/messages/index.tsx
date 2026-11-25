import { Loader } from "@/components/Loader";
import { COLORS } from "@/constants/theme";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { styles } from "@/styles/messages.styles";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery } from "convex/react";
import { formatDistanceToNow } from "date-fns";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import {
  FlatList,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

export default function MessagesScreen() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [openingUserId, setOpeningUserId] = useState<string | null>(null);

  const conversations = useQuery(api.messages.getConversations);
  const users = useQuery(api.users.getUsers);
  const getOrCreateConversation = useMutation(api.messages.getOrCreateConversation);

  const otherUsers = useMemo(() => {
    if (!users) return [];
    const term = search.trim().toLowerCase();
    return users
      .filter((u) => !u.isCurrentUser)
      .filter(
        (u) =>
          !term ||
          u.username.toLowerCase().includes(term) ||
          u.fullname.toLowerCase().includes(term)
      );
  }, [users, search]);

  const filteredConversations = useMemo(() => {
    if (!conversations) return [];
    const term = search.trim().toLowerCase();
    if (!term) return conversations;
    return conversations.filter(
      (c) =>
        c.otherUser.username.toLowerCase().includes(term) ||
        c.otherUser.fullname.toLowerCase().includes(term)
    );
  }, [conversations, search]);

  const handleOpenUserChat = async (userId: Id<"users">) => {
    if (openingUserId) return;
    try {
      setOpeningUserId(userId);
      const conversationId = await getOrCreateConversation({ otherUserId: userId });
      router.push(`/messages/${conversationId}`);
    } catch (error) {
      console.error("Failed to open conversation:", error);
    } finally {
      setOpeningUserId(null);
    }
  };

  if (conversations === undefined || users === undefined) return <Loader />;

  return (
    <View style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={COLORS.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Messages</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* SEARCH */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={18} color={COLORS.grey} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search people or chats..."
          placeholderTextColor={COLORS.grey}
          style={styles.searchInput}
          autoCapitalize="none"
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch("")}>
            <Ionicons name="close-circle" size={18} color={COLORS.grey} />
          </TouchableOpacity>
        )}
      </View>

      {/* QUICK START CHAT STRIP */}
      {otherUsers.length > 0 && (
        <View>
          <Text style={styles.sectionLabel}>Start a chat</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.usersStrip}
          >
            {otherUsers.map((user) => (
              <TouchableOpacity
                key={user._id}
                style={styles.userChip}
                onPress={() => handleOpenUserChat(user._id)}
                disabled={openingUserId === user._id}
              >
                <Image
                  source={user.image}
                  style={styles.userChipAvatar}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                />
                <Text style={styles.userChipName} numberOfLines={1}>
                  {user.username}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* CONVERSATIONS LIST */}
      <FlatList
        data={filteredConversations}
        keyExtractor={(item) => item._id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="chatbubbles-outline" size={52} color={COLORS.primary} />
            <Text style={styles.emptyTitle}>No messages yet</Text>
            <Text style={styles.emptySubtitle}>
              Tap any user above to start a real-time conversation.
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const isFromOther = item.lastMessageSenderId === item.otherUser._id;
          const hasUnread = item.unreadCount > 0;
          const preview = item.lastMessageText
            ? isFromOther
              ? item.lastMessageText
              : `You: ${item.lastMessageText}`
            : "Say hello!";

          return (
            <TouchableOpacity
              style={styles.conversationItem}
              onPress={() => router.push(`/messages/${item._id}`)}
            >
              <Image
                source={item.otherUser.image}
                style={styles.avatar}
                contentFit="cover"
                cachePolicy="memory-disk"
              />

              <View style={styles.conversationInfo}>
                <View style={styles.conversationTop}>
                  <Text style={styles.username}>{item.otherUser.username}</Text>
                  <Text style={styles.timeAgo}>
                    {formatDistanceToNow(item.lastMessageAt, { addSuffix: true })}
                  </Text>
                </View>

                <View style={styles.conversationBottom}>
                  <Text
                    style={[styles.lastMessage, hasUnread && styles.lastMessageUnread]}
                    numberOfLines={1}
                  >
                    {preview}
                  </Text>
                  {hasUnread && (
                    <View style={styles.unreadBadge}>
                      <Text style={styles.unreadBadgeText}>
                        {item.unreadCount > 99 ? "99+" : item.unreadCount}
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}
