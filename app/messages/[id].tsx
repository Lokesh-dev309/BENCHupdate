import { Loader } from "@/components/Loader";
import { COLORS } from "@/constants/theme";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { styles } from "@/styles/messages.styles";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery } from "convex/react";
import { format } from "date-fns";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  LayoutChangeEvent,
  Platform,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const conversationId = id as Id<"conversations">;

  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);
  const baseHeightRef = useRef(0);

  useEffect(() => {
    if (Platform.OS !== "android") return;

    const showSub = Keyboard.addListener("keyboardDidShow", (e) => {
      setKeyboardHeight(e.endCoordinates.height);
    });
    const hideSub = Keyboard.addListener("keyboardDidHide", () => {
      setKeyboardHeight(0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const handleContainerLayout = (e: LayoutChangeEvent) => {
    const { height } = e.nativeEvent.layout;
    setContainerHeight(height);
    if (keyboardHeight === 0 && height > baseHeightRef.current) {
      baseHeightRef.current = height;
    }
  };

  const androidKeyboardPadding = useMemo(() => {
    if (Platform.OS !== "android" || keyboardHeight === 0) return 0;
    const windowShrink = Math.max(0, baseHeightRef.current - containerHeight);
    return Math.max(0, keyboardHeight - insets.bottom - windowShrink);
  }, [keyboardHeight, containerHeight, insets.bottom]);

  const details = useQuery(
    api.messages.getConversationDetails,
    id ? { conversationId } : "skip"
  );
  const messages = useQuery(
    api.messages.getMessages,
    id ? { conversationId } : "skip"
  );

  const sendMessage = useMutation(api.messages.sendMessage);
  const markMessagesAsRead = useMutation(api.messages.markMessagesAsRead);

  // Mark incoming messages as read in real time while viewing the chat.
  useEffect(() => {
    if (!details || !messages) return;
    const hasUnread = messages.some(
      (m) => m.receiverId === details.currentUserId && !m.isRead
    );
    if (hasUnread) {
      markMessagesAsRead({ conversationId }).catch((err) =>
        console.error("Failed to mark messages as read:", err)
      );
    }
  }, [conversationId, details, messages, markMessagesAsRead]);

  const reversedMessages = useMemo(() => {
    if (!messages) return [];
    return [...messages].reverse();
  }, [messages]);

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;

    try {
      setSending(true);
      setText("");
      await sendMessage({ conversationId, content: trimmed });
    } catch (error) {
      console.error("Failed to send message:", error);
      setText(trimmed);
    } finally {
      setSending(false);
    }
  };

  if (details === undefined || messages === undefined) return <Loader />;
  if (details === null) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyTitle}>Conversation not found</Text>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={{ color: COLORS.primary, marginTop: 8 }}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View
      style={[styles.container, { paddingBottom: androidKeyboardPadding }]}
      onLayout={handleContainerLayout}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        enabled={Platform.OS === "ios"}
        keyboardVerticalOffset={0}
      >
      {/* CHAT HEADER */}
      <View style={styles.chatHeader}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={COLORS.white} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.chatHeaderUser}
          onPress={() => router.push(`/user/${details.otherUser._id}`)}
        >
          <Image
            source={details.otherUser.image}
            style={styles.chatHeaderAvatar}
            contentFit="cover"
            cachePolicy="memory-disk"
          />
          <View>
            <Text style={styles.chatHeaderName}>{details.otherUser.fullname}</Text>
            <Text style={styles.chatHeaderUsername}>@{details.otherUser.username}</Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* REAL-TIME MESSAGES LIST */}
      <FlatList
        data={reversedMessages}
        inverted={reversedMessages.length > 0}
        keyExtractor={(item) => item._id}
        contentContainerStyle={styles.messagesList}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Image
              source={details.otherUser.image}
              style={{ width: 64, height: 64, borderRadius: 32, marginBottom: 4 }}
              contentFit="cover"
            />
            <Text style={styles.emptyTitle}>{details.otherUser.fullname}</Text>
            <Text style={styles.emptySubtitle}>
              Send a message to start chatting in real time.
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const isMine = item.senderId === details.currentUserId;
          return (
            <View
              style={[
                styles.messageRow,
                isMine ? styles.myMessageRow : styles.otherMessageRow,
              ]}
            >
              <View
                style={[
                  styles.messageBubble,
                  isMine ? styles.myMessageBubble : styles.otherMessageBubble,
                ]}
              >
                <Text style={styles.messageText}>{item.content}</Text>
                <View style={styles.messageMeta}>
                  <Text style={styles.messageTime}>
                    {format(item._creationTime, "h:mm a")}
                  </Text>
                  {isMine && (
                    <Ionicons
                      name={item.isRead ? "checkmark-done" : "checkmark"}
                      size={13}
                      color={item.isRead ? "#BFDBFE" : "rgba(255,255,255,0.7)"}
                    />
                  )}
                </View>
              </View>
            </View>
          );
        }}
      />

      {/* MESSAGE INPUT BAR */}
      <View style={styles.inputBar}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={`Message ${details.otherUser.username}...`}
          placeholderTextColor={COLORS.grey}
          style={styles.messageInput}
          multiline
          maxLength={1000}
        />
        <TouchableOpacity
          style={[
            styles.sendButton,
            (!text.trim() || sending) && styles.sendButtonDisabled,
          ]}
          onPress={handleSend}
          disabled={!text.trim() || sending}
        >
          <Ionicons name="send" size={18} color={COLORS.white} />
        </TouchableOpacity>
      </View>
      </KeyboardAvoidingView>
    </View>
  );
}
