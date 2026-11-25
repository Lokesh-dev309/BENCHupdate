import { COLORS } from "@/constants/theme";
import { api } from "@/convex/_generated/api";
import { storyStyles } from "@/styles/stories.styles";
import { Ionicons } from "@expo/vector-icons";
import { useMutation } from "convex/react";
import * as FileSystem from "expo-file-system";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type AddStoryModalProps = {
  visible: boolean;
  onClose: () => void;
};

export default function AddStoryModal({ visible, onClose }: AddStoryModalProps) {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [isUploading, setIsUploading] = useState(false);

  const generateUploadUrl = useMutation(api.posts.generateUploadUrl);
  const createStory = useMutation(api.stories.createStory);

  const resetAndClose = () => {
    if (isUploading) return;
    setSelectedImage(null);
    setCaption("");
    onClose();
  };

  const pickFromGallery = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: "images",
      allowsEditing: true,
      aspect: [9, 16],
      quality: 0.85,
    });

    if (!result.canceled) {
      setSelectedImage(result.assets[0].uri);
    }
  };

  const takePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Camera Permission", "Please allow camera access to take a story photo.");
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [9, 16],
      quality: 0.85,
    });

    if (!result.canceled) {
      setSelectedImage(result.assets[0].uri);
    }
  };

  const handleShareStory = async () => {
    if (!selectedImage || isUploading) return;

    try {
      setIsUploading(true);
      const uploadUrl = await generateUploadUrl();

      const uploadResult = await FileSystem.uploadAsync(uploadUrl, selectedImage, {
        httpMethod: "POST",
        uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
        mimeType: "image/jpeg",
      });

      if (uploadResult.status !== 200) throw new Error("Upload failed");

      const { storageId } = JSON.parse(uploadResult.body);
      await createStory({ storageId, caption });

      setSelectedImage(null);
      setCaption("");
      onClose();
    } catch (error) {
      console.error("Failed to create story:", error);
      Alert.alert("Error", "Could not upload story. Please try again.");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={resetAndClose}>
      <SafeAreaView style={storyStyles.addContainer}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          {/* HEADER */}
          <View style={storyStyles.addHeader}>
            <TouchableOpacity onPress={resetAndClose} disabled={isUploading}>
              <Ionicons name="close" size={26} color={COLORS.white} />
            </TouchableOpacity>
            <Text style={storyStyles.addTitle}>Add to Story</Text>
            {selectedImage ? (
              <TouchableOpacity onPress={handleShareStory} disabled={isUploading}>
                {isUploading ? (
                  <ActivityIndicator size="small" color={COLORS.primary} />
                ) : (
                  <Text style={storyStyles.shareBtnText}>Share</Text>
                )}
              </TouchableOpacity>
            ) : (
              <View style={{ width: 42 }} />
            )}
          </View>

          {!selectedImage ? (
            <View style={storyStyles.pickerEmpty}>
              <Ionicons name="aperture-outline" size={64} color={COLORS.primary} />
              <Text style={storyStyles.pickerPromptTitle}>Share a 24-hour story</Text>
              <Text style={storyStyles.pickerPromptSubtitle}>
                Photos disappear automatically after 24 hours.
              </Text>

              <TouchableOpacity style={storyStyles.pickerActionBtn} onPress={pickFromGallery}>
                <Ionicons name="images-outline" size={20} color={COLORS.white} />
                <Text style={storyStyles.pickerActionText}>Choose from Gallery</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[storyStyles.pickerActionBtn, storyStyles.pickerSecondaryBtn]}
                onPress={takePhoto}
              >
                <Ionicons name="camera-outline" size={20} color={COLORS.white} />
                <Text style={storyStyles.pickerActionText}>Take a Photo</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={storyStyles.previewWrapper}>
              <View style={storyStyles.previewImageContainer}>
                <Image
                  source={selectedImage}
                  style={storyStyles.previewImage}
                  contentFit="cover"
                />
                <TouchableOpacity
                  style={storyStyles.changeMediaBtn}
                  onPress={pickFromGallery}
                  disabled={isUploading}
                >
                  <Ionicons name="swap-horizontal" size={16} color={COLORS.white} />
                  <Text style={storyStyles.changeMediaText}>Change</Text>
                </TouchableOpacity>
              </View>

              <TextInput
                value={caption}
                onChangeText={setCaption}
                placeholder="Add a caption to your story..."
                placeholderTextColor={COLORS.grey}
                style={storyStyles.captionInput}
                multiline
                maxLength={200}
                editable={!isUploading}
              />
            </View>
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}
