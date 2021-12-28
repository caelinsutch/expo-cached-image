import React, { useEffect, useState } from "react";
import {
  Image,
  ImageURISource,
  InteractionManager,
  ImageProps as ReactNativeImageProps,
} from "react-native";
import * as FileSystem from "expo-file-system";
import { DownloadResumable } from "expo-file-system/src/FileSystem";
import { DownloadProgressData } from "expo-file-system";

type CachedImageProps = {
  source: ImageURISource;
} & Omit<ReactNativeImageProps, "source">;

const CachedImage: React.FC<CachedImageProps> = ({ source, ...props }) => {
  const [downloadResumable, setDownloadResumable] =
    useState<DownloadResumable | null>(null);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  // https://stackoverflow.com/questions/7616461/generate-a-hash-from-string-in-javascript
  const hashCode = (s: string) =>
    s.split("").reduce((a, b) => ((a << 5) - a + b.charCodeAt(0)) | 0, 0);

  const getImageFilesystemKey = async (remoteURI: string) =>
    `${FileSystem.documentDirectory}${hashCode(remoteURI)}`;

  const checkClear = async () => {
    try {
      if (downloadResumable) {
        const t = await downloadResumable.pauseAsync();
        const filesystemURI = await getImageFilesystemKey(source.uri as string);
        const metadata = await FileSystem.getInfoAsync(filesystemURI);
        if (metadata.exists) {
          await FileSystem.deleteAsync(t.fileUri);
        }
      }
    } catch (error) {
      console.log(error);
    }
  };

  const onDownloadUpdate = (downloadProgress: DownloadProgressData) => {
    if (
      downloadProgress.totalBytesWritten >=
      downloadProgress.totalBytesExpectedToWrite
    ) {
      if (downloadResumable && downloadResumable._removeSubscription) {
        downloadResumable._removeSubscription();
      }
      setDownloadResumable(null);
    }
  };

  const loadImage = async (filesystemURI: string, remoteURI: string) => {
    if (downloadResumable && downloadResumable._removeSubscription) {
      downloadResumable._removeSubscription();
    }
    try {
      // Use the cached image if it exists
      const metadata = await FileSystem.getInfoAsync(filesystemURI);
      if (metadata.exists) {
        setImageUri(filesystemURI);

        return;
      }

      // otherwise download to cache
      const tDownloadResumable = FileSystem.createDownloadResumable(
        remoteURI,
        filesystemURI,
        {},
        (dp) => onDownloadUpdate(dp)
      );

      const imageObject = await tDownloadResumable.downloadAsync();
      setDownloadResumable(tDownloadResumable);
      if (mounted) {
        if (imageObject && imageObject.status === 200) {
          setImageUri(imageObject.uri);
        }
      }
    } catch (err) {
      if (mounted) {
        setImageUri(null);
      }
      const metadata = await FileSystem.getInfoAsync(filesystemURI);
      if (metadata.exists) {
        await FileSystem.deleteAsync(filesystemURI);
      }
    }
  };

  useEffect(() => {
    const interaction = InteractionManager.runAfterInteractions(async () => {
      if (source?.uri) {
        const filesystemURI = await getImageFilesystemKey(source.uri);
        await loadImage(filesystemURI, source.uri);
      }
    });

    return () => {
      if (interaction) interaction.cancel();
      if (downloadResumable) downloadResumable._removeSubscription();
      setMounted(false);
      checkClear();
    };
  });

  let localSource: ImageURISource | null = imageUri ? { uri: imageUri } : null;
  if (!localSource && source) {
    localSource = { ...source, cache: "force-cache" };
  }

  return <Image {...props} source={localSource as ImageURISource} />;
};

export default CachedImage;
