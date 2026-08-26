import React from'react';
import { Modal, Pressable, StyleSheet, View, Dimensions, Share } from'react-native';
import { Image, ImageSource } from'expo-image';
import { Ionicons } from'@expo/vector-icons';
import { AppText } from'./AppText';

interface ImageViewerModalProps {
 visible: boolean;
 onClose: () => void;
 imageSource: ImageSource | string | null;
 caption?: string;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export function ImageViewerModal({
 visible,
 onClose,
 imageSource,
 caption,
}: ImageViewerModalProps) {
 if (!imageSource) return null;

 async function handleShare() {
 try {
 await Share.share({
 message: caption ? `Campus Photo: ${caption}` : 'Campus Media from Lioris App',
 });
 } catch {}
 }

 const resolvedSource =
 typeof imageSource === 'string'
 ? imageSource.startsWith('http') || imageSource.startsWith('file')
 ? { uri: imageSource }
 : imageSource === 'event_tech_hackathon'
 ? require('../../assets/images/event_tech_hackathon.jpg')
 : imageSource === 'event_academic_symposium'
 ? require('../../assets/images/event_academic_symposium.jpg')
 : imageSource === 'campus_students_photo'
 ? require('../../assets/images/campus_students_photo.jpg')
 : imageSource === 'campus_library_study'
 ? require('../../assets/images/campus_library_study.jpg')
 : imageSource === 'student_rep_group'
 ? require('../../assets/images/student_rep_group.jpg')
 : { uri: imageSource }
 : imageSource;

 return (
 <Modal visible={visible} transparent animationType="fade"onRequestClose={onClose}>
 <View style={styles.container}>
 {/* Top Header Bar */}
 <View style={styles.topBar}>
 <Pressable onPress={onClose} hitSlop={12} style={styles.iconButton} accessibilityLabel="Close Fullscreen View">
 <Ionicons name="close"size={24} color="#FFFFFF" />
 </Pressable>

 <View style={styles.actionsRight}>
 <Pressable onPress={handleShare} hitSlop={12} style={styles.iconButton} accessibilityLabel="Share Image">
 <Ionicons name="share-outline"size={22} color="#FFFFFF" />
 </Pressable>
 </View>
 </View>

 {/* Main Centered Full-Screen Image */}
 <Pressable style={styles.imageWrapper} onPress={onClose}>
 <Image
 source={resolvedSource}
 style={styles.fullImage}
 contentFit="contain"transition={300}
 />
 </Pressable>

 {/* Caption Bar */}
 {caption ? (
 <View style={styles.captionBar}>
 <AppText variant="bodySmall"weight="medium"tone="inverse"style={{ textAlign: 'center' }}>
 {caption}
 </AppText>
 </View>
 ) : null}
 </View>
 </Modal>
 );
}

const styles = StyleSheet.create({
 container: {
 flex: 1,
 backgroundColor: 'rgba(0, 0, 0, 0.95)',
 justifyContent: 'center',
 alignItems: 'center',
 },
 topBar: {
 position: 'absolute',
 top: 48,
 left: 16,
 right: 16,
 zIndex: 10,
 flexDirection: 'row',
 justifyContent: 'space-between',
 alignItems: 'center',
 },
 actionsRight: {
 flexDirection: 'row',
 alignItems: 'center',
 gap: 12,
 },
 iconButton: {
 width: 44,
 height: 44,
 borderRadius: 22,
 backgroundColor: 'rgba(255, 255, 255, 0.2)',
 alignItems: 'center',
 justifyContent: 'center',
 },
 imageWrapper: {
 width: SCREEN_WIDTH,
 height: SCREEN_HEIGHT * 0.82,
 justifyContent: 'center',
 alignItems: 'center',
 },
 fullImage: {
 width: '100%',
 height: '100%',
 },
 captionBar: {
 position: 'absolute',
 bottom: 36,
 left: 20,
 right: 20,
 backgroundColor: 'rgba(0, 0, 0, 0.65)',
 paddingHorizontal: 16,
 paddingVertical: 10,
 borderRadius: 16,
 },
});
