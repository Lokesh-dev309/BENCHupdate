import { Loader } from "@/components/Loader";
import Post from "@/components/Post";
import StoriesSection from "@/components/Stories";
import { COLORS } from "@/constants/theme";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "convex/react";
import { useRouter } from "expo-router";
import {
  FlatList,
  RefreshControl,
  Text,
  TouchableOpacity,
  View,
  Image,
} from "react-native";
import { styles } from "../../styles/feed.styles";
import { useState } from "react";

export default function Index() {
  const { signOut } = useAuth();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

  const posts = useQuery(api.posts.getFeedPosts);
  const unreadMessagesCount = useQuery(api.messages.getUnreadCount) ?? 0;

  if (posts === undefined) return <Loader />;

  // this does nothing
  const onRefresh = () => {
    setRefreshing(true);
    setTimeout(() => {
      setRefreshing(false);
    }, 2000);
  };

  return (
    <View style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <Image
          source={require("../../assets/images/social-media.png")}
          style={{ width: 40, height: 40 }}
          resizeMode="cover"
        />

        <Text style={styles.headerTitle}>BENCH</Text>

        <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
          <TouchableOpacity onPress={() => signOut()}>
            <Ionicons name="log-out-outline" size={22} color={COLORS.grey} />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => router.push("/messages")}
            style={{ position: "relative", padding: 2 }}
          >
            <Ionicons name="paper-plane-outline" size={24} color={COLORS.white} />
            {unreadMessagesCount > 0 && (
              <View
                style={{
                  position: "absolute",
                  top: -4,
                  right: -6,
                  minWidth: 18,
                  height: 18,
                  borderRadius: 9,
                  backgroundColor: COLORS.primary,
                  alignItems: "center",
                  justifyContent: "center",
                  paddingHorizontal: 4,
                }}
              >
                <Text style={{ color: COLORS.white, fontSize: 10, fontWeight: "700" }}>
                  {unreadMessagesCount > 99 ? "99+" : unreadMessagesCount}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {posts.length === 0 ? (
        <View style={{ flex: 1 }}>
          <StoriesSection />
          <NoPostsFound />
        </View>
      ) : (
        <FlatList
          data={posts}
          renderItem={({ item }) => <Post post={item} />}
          keyExtractor={(item) => item._id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 60 }}
          ListHeaderComponent={<StoriesSection />}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={COLORS.primary}
            />
          }
        />
      )}
    </View>
  );
}

const NoPostsFound = () => (
  <View
    style={{
      flex: 1,
      backgroundColor: COLORS.background,
      justifyContent: "center",
      alignItems: "center",
    }}
  >
    <Text style={{ fontSize: 20, color: COLORS.primary }}>No posts yet</Text>
  </View>
);
