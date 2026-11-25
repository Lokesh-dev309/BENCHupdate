import { api } from "@/convex/_generated/api";
import { useAuth } from "@clerk/clerk-expo";
import { useMutation } from "convex/react";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { Platform } from "react-native";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (Platform.OS === "web" || !Device.isDevice) {
    return null;
  }

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "default",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#407BFF",
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") {
    return null;
  }

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;

  if (!projectId) {
    return null;
  }

  const tokenResult = await Notifications.getExpoPushTokenAsync({ projectId });
  return tokenResult.data;
}

/** Registers the device's Expo push token with Convex and handles notification taps. */
export function usePushNotifications() {
  const { isSignedIn } = useAuth();
  const router = useRouter();
  const savePushToken = useMutation(api.push.savePushToken);
  const registeredTokenRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isSignedIn) return;

    let isMounted = true;

    registerForPushNotificationsAsync()
      .then((token) => {
        if (!isMounted || !token || registeredTokenRef.current === token) return;
        registeredTokenRef.current = token;
        return savePushToken({ token, platform: Platform.OS });
      })
      .catch((error) => {
        console.log("Push registration skipped:", error);
      });

    return () => {
      isMounted = false;
    };
  }, [isSignedIn, savePushToken]);

  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        if (!isSignedIn) return;
        const data = response.notification.request.content.data as {
          type?: string;
          conversationId?: string;
          senderId?: string;
        };

        if (data?.type === "message" && data.conversationId) {
          router.push(`/messages/${data.conversationId}`);
        } else if (data?.type === "follow" && data.senderId) {
          router.push(`/user/${data.senderId}`);
        } else if (data?.type === "like" || data?.type === "comment") {
          router.push("/(tabs)/notifications");
        }
      }
    );

    return () => subscription.remove();
  }, [isSignedIn, router]);
}
