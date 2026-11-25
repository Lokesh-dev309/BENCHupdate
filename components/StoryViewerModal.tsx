import { COLORS } from "@/constants/theme";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { storyStyles } from "@/styles/stories.styles";
import { Ionicons } from "@expo/vector-icons";
import { useMutation } from "convex/react";
import { formatDistanceToNow } from "date-fns";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  FlatList,
  Modal,
  Pressable,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const STORY_DURATION_MS = 5000;

export type StoryItem = {
  _id: Id<"stories">;
  imageUrl: string;
  caption?: string;
  _creationTime: number;
  expiresAt: number;
  isViewed: boolean;
  viewsCount: number;
  viewers: {
    _id: string;
    username: string;
    fullname: string;
    image: string;
    viewedAt: number;
  }[];
};

export type StoryUserGroup = {
  _id: Id<"users">;
  username: string;
  fullname: string;
  image: string;
  isCurrentUser: boolean;
  hasStory: boolean;
  hasUnseenStory: boolean;
  stories: StoryItem[];
};

type StoryViewerModalProps = {
  visible: boolean;
  userGroups: StoryUserGroup[];
  initialUserId: string | null;
  onClose: () => void;
  onAddStory: () => void;
};

export default function StoryViewerModal({
  visible,
  userGroups,
  initialUserId,
  onClose,
  onAddStory,
}: StoryViewerModalProps) {
  const router = useRouter();
  const markStoryViewed = useMutation(api.stories.markStoryViewed);
  const deleteStory = useMutation(api.stories.deleteStory);

  const [userIndex, setUserIndex] = useState(0);
  const [storyIndex, setStoryIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [showViewers, setShowViewers] = useState(false);

  const progress = useRef(new Animated.Value(0)).current;
  const progressValueRef = useRef(0);

  // Sync initial user and first unseen story when modal opens.
  useEffect(() => {
    if (!visible || !initialUserId) return;
    const idx = userGroups.findIndex((g) => g._id === initialUserId);
    if (idx === -1) return;

    const group = userGroups[idx];
    const firstUnseen = group.stories.findIndex((s) => !s.isViewed);
    setUserIndex(idx);
    setStoryIndex(firstUnseen >= 0 ? firstUnseen : 0);
    setIsPaused(false);
    setShowViewers(false);
    progress.setValue(0);
    progressValueRef.current = 0;
  }, [visible, initialUserId]);

  const currentGroup = userGroups[userIndex];
  const currentStory = currentGroup?.stories[storyIndex];

  // Keep indices valid if a story is deleted or expires while open.
  useEffect(() => {
    if (!visible) return;
    if (userGroups.length === 0) {
      onClose();
      return;
    }
    if (!currentGroup) {
      setUserIndex(0);
      setStoryIndex(0);
      return;
    }
    if (!currentStory && currentGroup.stories.length > 0) {
      setStoryIndex(Math.max(0, currentGroup.stories.length - 1));
    }
  }, [visible, userGroups.length, currentGroup, currentStory, onClose]);

  const goNext = useCallback(() => {
    if (!currentGroup) {
      onClose();
      return;
    }
    if (storyIndex < currentGroup.stories.length - 1) {
      setStoryIndex((prev) => prev + 1);
      progress.setValue(0);
      progressValueRef.current = 0;
    } else if (userIndex < userGroups.length - 1) {
      const nextGroup = userGroups[userIndex + 1];
      const firstUnseen = nextGroup.stories.findIndex((s) => !s.isViewed);
      setUserIndex((prev) => prev + 1);
      setStoryIndex(firstUnseen >= 0 ? firstUnseen : 0);
      progress.setValue(0);
      progressValueRef.current = 0;
    } else {
      onClose();
    }
  }, [currentGroup, storyIndex, userIndex, userGroups, onClose, progress]);

  const goPrev = useCallback(() => {
    if (storyIndex > 0) {
      setStoryIndex((prev) => prev - 1);
      progress.setValue(0);
      progressValueRef.current = 0;
    } else if (userIndex > 0) {
      const prevGroup = userGroups[userIndex - 1];
      setUserIndex((prev) => prev - 1);
      setStoryIndex(Math.max(0, prevGroup.stories.length - 1));
      progress.setValue(0);
      progressValueRef.current = 0;
    } else {
      progress.setValue(0);
      progressValueRef.current = 0;
    }
  }, [storyIndex, userIndex, userGroups, progress]);

  // Mark story as viewed when displayed.
  useEffect(() => {
    if (!visible || !currentGroup || !currentStory) return;
    if (!currentGroup.isCurrentUser && !currentStory.isViewed) {
      markStoryViewed({ storyId: currentStory._id }).catch((err) =>
        console.error("Failed to mark story viewed:", err)
      );
    }
  }, [visible, currentGroup, currentStory, markStoryViewed]);

  // Animate progress bar and auto-advance when not paused.
  useEffect(() => {
    if (!visible || !currentStory || isPaused || showViewers) return;

    const listenerId = progress.addListener(({ value }) => {
      progressValueRef.current = value;
    });

    const remainingMs = Math.max(
      100,
      STORY_DURATION_MS * (1 - progressValueRef.current)
    );

    const anim = Animated.timing(progress, {
      toValue: 1,
      duration: remainingMs,
      useNativeDriver: false,
    });

    anim.start(({ finished }) => {
      if (finished) {
        goNext();
      }
    });

    return () => {
      progress.removeListener(listenerId);
      anim.stop();
    };
  }, [visible, currentStory?._id, isPaused, showViewers, goNext, progress]);

  // Reset progress when switching to a different story.
  useEffect(() => {
    progress.setValue(0);
    progressValueRef.current = 0;
  }, [currentStory?._id, progress]);

  const handleDelete = () => {
    if (!currentStory) return;
    setIsPaused(true);
    Alert.alert("Delete Story", "Remove this story for everyone?", [
      { text: "Cancel", style: "cancel", onPress: () => setIsPaused(false) },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteStory({ storyId: currentStory._id });
            setIsPaused(false);
          } catch (err) {
            console.error("Failed to delete story:", err);
            setIsPaused(false);
          }
        },
      },
    ]);
  };

  const handleOpenProfile = () => {
    if (!currentGroup) return;
    onClose();
    if (currentGroup.isCurrentUser) {
      router.push("/(tabs)/profile");
    } else {
      router.push(`/user/${currentGroup._id}`);
    }
  };

  if (!visible || !currentGroup || !currentStory) return null;

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose}>
      <SafeAreaView style={storyStyles.viewerContainer}>
        {/* FULL SCREEN IMAGE */}
        <Image
          source={currentStory.imageUrl}
          style={storyStyles.viewerImage}
          contentFit="cover"
          cachePolicy="memory-disk"
        />

        {/* TOP PROGRESS + AUTHOR HEADER */}
        <View style={storyStyles.topOverlay}>
          <View style={storyStyles.progressRow}>
            {currentGroup.stories.map((story, idx) => {
              const barWidth =
                idx < storyIndex
                  ? "100%"
                  : idx > storyIndex
                  ? "0%"
                  : progress.interpolate({
                      inputRange: [0, 1],
                      outputRange: ["0%", "100%"],
                    });

              return (
                <View key={story._id} style={storyStyles.progressTrack}>
                  <Animated.View
                    style={[storyStyles.progressFill, { width: barWidth }]}
                  />
                </View>
              );
            })}
          </View>

          <View style={storyStyles.viewerHeader}>
            <TouchableOpacity style={storyStyles.viewerAuthor} onPress={handleOpenProfile}>
              <Image
                source={currentGroup.image}
                style={storyStyles.viewerAvatar}
                contentFit="cover"
                cachePolicy="memory-disk"
              />
              <View>
                <Text style={storyStyles.viewerUsername}>
                  {currentGroup.isCurrentUser ? "Your story" : currentGroup.username}
                </Text>
                <Text style={storyStyles.viewerTime}>
                  {formatDistanceToNow(currentStory._creationTime, { addSuffix: true })}
                </Text>
              </View>
            </TouchableOpacity>

            <View style={storyStyles.viewerHeaderActions}>
              {currentGroup.isCurrentUser && (
                <>
                  <TouchableOpacity
                    onPress={() => {
                      onClose();
                      onAddStory();
                    }}
                  >
                    <Ionicons name="add-circle-outline" size={24} color={COLORS.white} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={handleDelete}>
                    <Ionicons name="trash-outline" size={22} color={COLORS.white} />
                  </TouchableOpacity>
                </>
              )}
              <TouchableOpacity onPress={onClose}>
                <Ionicons name="close" size={26} color={COLORS.white} />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* TAP ZONES (LEFT = PREV, RIGHT = NEXT, HOLD = PAUSE) */}
        <View style={storyStyles.tapZones}>
          <Pressable
            style={storyStyles.leftTapZone}
            onPress={goPrev}
            onLongPress={() => setIsPaused(true)}
            onPressOut={() => setIsPaused(false)}
            delayLongPress={150}
          />
          <Pressable
            style={storyStyles.rightTapZone}
            onPress={goNext}
            onLongPress={() => setIsPaused(true)}
            onPressOut={() => setIsPaused(false)}
            delayLongPress={150}
          />
        </View>

        {/* BOTTOM CAPTION & VIEWERS */}
        {(currentStory.caption || currentGroup.isCurrentUser) && (
          <View style={storyStyles.bottomOverlay}>
            {currentStory.caption && (
              <Text style={storyStyles.storyCaption}>{currentStory.caption}</Text>
            )}

            {currentGroup.isCurrentUser && (
              <TouchableOpacity
                style={storyStyles.seenByButton}
                onPress={() => setShowViewers(true)}
              >
                <Ionicons name="eye-outline" size={16} color={COLORS.white} />
                <Text style={storyStyles.seenByText}>
                  Seen by {currentStory.viewsCount}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* VIEWERS SHEET */}
        <Modal
          visible={showViewers}
          transparent
          animationType="slide"
          onRequestClose={() => setShowViewers(false)}
        >
          <Pressable
            style={storyStyles.viewersBackdrop}
            onPress={() => setShowViewers(false)}
          >
            <Pressable style={storyStyles.viewersSheet} onPress={() => {}}>
              <View style={storyStyles.viewersHeader}>
                <Text style={storyStyles.viewersTitle}>
                  Viewers ({currentStory.viewsCount})
                </Text>
                <TouchableOpacity onPress={() => setShowViewers(false)}>
                  <Ionicons name="close" size={22} color={COLORS.white} />
                </TouchableOpacity>
              </View>

              <FlatList
                data={currentStory.viewers}
                keyExtractor={(item) => item._id}
                ListEmptyComponent={
                  <Text
                    style={{
                      color: COLORS.grey,
                      textAlign: "center",
                      paddingVertical: 28,
                    }}
                  >
                    No views yet
                  </Text>
                }
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={storyStyles.viewerRow}
                    onPress={() => {
                      setShowViewers(false);
                      onClose();
                      router.push(`/user/${item._id}`);
                    }}
                  >
                    <Image
                      source={item.image}
                      style={storyStyles.viewerRowAvatar}
                      contentFit="cover"
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={storyStyles.viewerRowName}>{item.username}</Text>
                      <Text style={storyStyles.viewerRowTime}>
                        {formatDistanceToNow(item.viewedAt, { addSuffix: true })}
                      </Text>
                    </View>
                  </TouchableOpacity>
                )}
              />
            </Pressable>
          </Pressable>
        </Modal>
      </SafeAreaView>
    </Modal>
  );
}
