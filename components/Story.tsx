import { styles } from "@/styles/feed.styles";
import { storyStyles } from "@/styles/stories.styles";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { Text, TouchableOpacity, View } from "react-native";

type StoryProps = {
  story: {
    id: string;
    username: string;
    avatar: string;
    hasStory: boolean;
    hasUnseenStory: boolean;
    isCurrentUser?: boolean;
  };
  onOpenStory: (userId: string) => void;
  onAddStory: () => void;
};

export default function Story({ story, onOpenStory, onAddStory }: StoryProps) {
  const router = useRouter();

  const handlePress = () => {
    if (story.hasStory) {
      onOpenStory(story.id);
    } else if (story.isCurrentUser) {
      onAddStory();
    } else {
      router.push(`/user/${story.id}`);
    }
  };

  const ringStyle = !story.hasStory
    ? storyStyles.noActiveStoryRing
    : story.hasUnseenStory
    ? undefined
    : storyStyles.seenRing;

  return (
    <TouchableOpacity style={styles.storyWrapper} onPress={handlePress}>
      <View style={storyStyles.avatarContainer}>
        <View style={[styles.storyRing, ringStyle]}>
          <Image
            source={story.avatar}
            style={styles.storyAvatar}
            contentFit="cover"
            transition={200}
            cachePolicy="memory-disk"
          />
        </View>

        {story.isCurrentUser && (
          <TouchableOpacity
            style={storyStyles.addStoryBadge}
            onPress={(e) => {
              e.stopPropagation();
              onAddStory();
            }}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <Ionicons name="add" size={14} color="#FFFFFF" />
          </TouchableOpacity>
        )}
      </View>

      <Text style={styles.storyUsername} numberOfLines={1}>
        {story.isCurrentUser ? "Your story" : story.username}
      </Text>
    </TouchableOpacity>
  );
}
