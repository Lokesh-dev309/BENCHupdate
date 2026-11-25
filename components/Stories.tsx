import { api } from "@/convex/_generated/api";
import { styles } from "@/styles/feed.styles";
import { useQuery } from "convex/react";
import { useMemo, useState } from "react";
import { ScrollView } from "react-native";
import AddStoryModal from "./AddStoryModal";
import Story from "./Story";
import StoryViewerModal from "./StoryViewerModal";

const StoriesSection = () => {
  const userGroups = useQuery(api.stories.getActiveStories);
  const [activeViewerUserId, setActiveViewerUserId] = useState<string | null>(null);
  const [showAddStoryModal, setShowAddStoryModal] = useState(false);

  const activeGroupsWithStories = useMemo(() => {
    if (!userGroups) return [];
    return userGroups.filter((group) => group.hasStory);
  }, [userGroups]);

  if (!userGroups || userGroups.length === 0) return null;

  return (
    <>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.storiesContainer}
      >
        {userGroups.map((group) => (
          <Story
            key={group._id}
            story={{
              id: group._id,
              username: group.username,
              avatar: group.image,
              hasStory: group.hasStory,
              hasUnseenStory: group.hasUnseenStory,
              isCurrentUser: group.isCurrentUser,
            }}
            onOpenStory={(userId) => setActiveViewerUserId(userId)}
            onAddStory={() => setShowAddStoryModal(true)}
          />
        ))}
      </ScrollView>

      <AddStoryModal
        visible={showAddStoryModal}
        onClose={() => setShowAddStoryModal(false)}
      />

      <StoryViewerModal
        visible={activeViewerUserId !== null}
        userGroups={activeGroupsWithStories}
        initialUserId={activeViewerUserId}
        onClose={() => setActiveViewerUserId(null)}
        onAddStory={() => setShowAddStoryModal(true)}
      />
    </>
  );
};

export default StoriesSection;
