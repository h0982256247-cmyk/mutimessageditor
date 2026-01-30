/**
 * LINE API TypeScript 類型定義
 * 可複製到專案中使用
 */

// ============================================
// Messaging API Types
// ============================================

export interface LineMessage {
  type: 'text' | 'image' | 'video' | 'audio' | 'location' | 'sticker' | 'flex';
}

export interface TextMessage extends LineMessage {
  type: 'text';
  text: string;
  emojis?: {
    index: number;
    productId: string;
    emojiId: string;
  }[];
}

export interface ImageMessage extends LineMessage {
  type: 'image';
  originalContentUrl: string;
  previewImageUrl: string;
}

export interface VideoMessage extends LineMessage {
  type: 'video';
  originalContentUrl: string;
  previewImageUrl: string;
  trackingId?: string;
}

export interface StickerMessage extends LineMessage {
  type: 'sticker';
  packageId: string;
  stickerId: string;
}

export interface LocationMessage extends LineMessage {
  type: 'location';
  title: string;
  address: string;
  latitude: number;
  longitude: number;
}

export interface FlexMessage extends LineMessage {
  type: 'flex';
  altText: string;
  contents: FlexContainer;
}

// ============================================
// Flex Message Types
// ============================================

export type FlexContainer = FlexBubble | FlexCarousel;

export interface FlexBubble {
  type: 'bubble';
  size?: 'nano' | 'micro' | 'kilo' | 'mega' | 'giga';
  direction?: 'ltr' | 'rtl';
  header?: FlexBox;
  hero?: FlexImage | FlexVideo;
  body?: FlexBox;
  footer?: FlexBox;
  styles?: BubbleStyles;
}

export interface FlexCarousel {
  type: 'carousel';
  contents: FlexBubble[];
}

export interface BubbleStyles {
  header?: BlockStyle;
  hero?: BlockStyle;
  body?: BlockStyle;
  footer?: BlockStyle;
}

export interface BlockStyle {
  backgroundColor?: string;
  separator?: boolean;
  separatorColor?: string;
}

export type FlexComponent = FlexBox | FlexText | FlexImage | FlexVideo | FlexButton | FlexSeparator | FlexSpacer | FlexIcon;

export interface FlexBox {
  type: 'box';
  layout: 'vertical' | 'horizontal' | 'baseline';
  contents: FlexComponent[];
  flex?: number;
  spacing?: 'none' | 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'xxl';
  margin?: 'none' | 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'xxl';
  paddingAll?: string;
  paddingTop?: string;
  paddingBottom?: string;
  paddingStart?: string;
  paddingEnd?: string;
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: string;
  cornerRadius?: string;
  action?: Action;
}

export interface FlexText {
  type: 'text';
  text: string;
  flex?: number;
  size?: 'xxs' | 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'xxl' | '3xl' | '4xl' | '5xl' | string;
  weight?: 'regular' | 'bold';
  color?: string;
  style?: 'normal' | 'italic';
  decoration?: 'none' | 'underline' | 'line-through';
  align?: 'start' | 'end' | 'center';
  gravity?: 'top' | 'bottom' | 'center';
  wrap?: boolean;
  maxLines?: number;
  action?: Action;
}

export interface FlexImage {
  type: 'image';
  url: string;
  flex?: number;
  size?: 'xxs' | 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'xxl' | '3xl' | '4xl' | '5xl' | 'full' | string;
  aspectRatio?: string;
  aspectMode?: 'cover' | 'fit';
  backgroundColor?: string;
  action?: Action;
}

export interface FlexVideo {
  type: 'video';
  url: string;
  previewUrl: string;
  aspectRatio?: string;
  altContent: FlexImage;
  action?: Action;
}

export interface FlexButton {
  type: 'button';
  action: Action;
  flex?: number;
  margin?: 'none' | 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'xxl';
  height?: 'sm' | 'md';
  style?: 'primary' | 'secondary' | 'link';
  color?: string;
  gravity?: 'top' | 'bottom' | 'center';
}

export interface FlexSeparator {
  type: 'separator';
  margin?: 'none' | 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'xxl';
  color?: string;
}

export interface FlexSpacer {
  type: 'spacer';
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'xxl';
}

export interface FlexIcon {
  type: 'icon';
  url: string;
  size?: 'xxs' | 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'xxl' | '3xl' | '4xl' | '5xl' | string;
  aspectRatio?: string;
}

// ============================================
// Action Types
// ============================================

export type Action = URIAction | MessageAction | PostbackAction | DatetimePickerAction | CameraAction | CameraRollAction | LocationAction;

export interface URIAction {
  type: 'uri';
  label?: string;
  uri: string;
  altUri?: { desktop: string };
}

export interface MessageAction {
  type: 'message';
  label?: string;
  text: string;
}

export interface PostbackAction {
  type: 'postback';
  label?: string;
  data: string;
  displayText?: string;
  inputOption?: 'closeRichMenu' | 'openRichMenu' | 'openKeyboard' | 'openVoice';
  fillInText?: string;
}

export interface DatetimePickerAction {
  type: 'datetimepicker';
  label?: string;
  data: string;
  mode: 'date' | 'time' | 'datetime';
  initial?: string;
  max?: string;
  min?: string;
}

export interface CameraAction {
  type: 'camera';
  label: string;
}

export interface CameraRollAction {
  type: 'cameraRoll';
  label: string;
}

export interface LocationAction {
  type: 'location';
  label: string;
}

// ============================================
// Webhook Event Types
// ============================================

export interface WebhookEvent {
  type: string;
  timestamp: number;
  source: EventSource;
  replyToken?: string;
  mode: 'active' | 'standby';
}

export type EventSource = UserSource | GroupSource | RoomSource;

export interface UserSource {
  type: 'user';
  userId: string;
}

export interface GroupSource {
  type: 'group';
  groupId: string;
  userId?: string;
}

export interface RoomSource {
  type: 'room';
  roomId: string;
  userId?: string;
}

export interface MessageEvent extends WebhookEvent {
  type: 'message';
  replyToken: string;
  message: EventMessage;
}

export type EventMessage = TextEventMessage | ImageEventMessage | VideoEventMessage | AudioEventMessage | FileEventMessage | LocationEventMessage | StickerEventMessage;

export interface TextEventMessage {
  id: string;
  type: 'text';
  text: string;
  emojis?: { index: number; length: number; productId: string; emojiId: string }[];
}

export interface ImageEventMessage {
  id: string;
  type: 'image';
  contentProvider: ContentProvider;
}

export interface VideoEventMessage {
  id: string;
  type: 'video';
  duration: number;
  contentProvider: ContentProvider;
}

export interface AudioEventMessage {
  id: string;
  type: 'audio';
  duration: number;
  contentProvider: ContentProvider;
}

export interface FileEventMessage {
  id: string;
  type: 'file';
  fileName: string;
  fileSize: number;
}

export interface LocationEventMessage {
  id: string;
  type: 'location';
  title: string;
  address: string;
  latitude: number;
  longitude: number;
}

export interface StickerEventMessage {
  id: string;
  type: 'sticker';
  packageId: string;
  stickerId: string;
  stickerResourceType: 'STATIC' | 'ANIMATION' | 'SOUND' | 'ANIMATION_SOUND' | 'POPUP' | 'POPUP_SOUND' | 'CUSTOM' | 'MESSAGE';
}

export interface ContentProvider {
  type: 'line' | 'external';
  originalContentUrl?: string;
  previewImageUrl?: string;
}

export interface FollowEvent extends WebhookEvent {
  type: 'follow';
  replyToken: string;
}

export interface UnfollowEvent extends WebhookEvent {
  type: 'unfollow';
}

export interface JoinEvent extends WebhookEvent {
  type: 'join';
  replyToken: string;
}

export interface LeaveEvent extends WebhookEvent {
  type: 'leave';
}

export interface PostbackEvent extends WebhookEvent {
  type: 'postback';
  replyToken: string;
  postback: {
    data: string;
    params?: {
      date?: string;
      time?: string;
      datetime?: string;
    };
  };
}

// ============================================
// Profile Types
// ============================================

export interface Profile {
  userId: string;
  displayName: string;
  pictureUrl?: string;
  statusMessage?: string;
  language?: string;
}

// ============================================
// LIFF Types
// ============================================

export interface LiffContext {
  type: 'utou' | 'room' | 'group' | 'none' | 'square_chat';
  viewType: 'full' | 'tall' | 'compact';
  userId?: string;
  utouId?: string;
  roomId?: string;
  groupId?: string;
  squareChatMemberId?: string;
  squareChatId?: string;
}

export interface LiffDecodedIdToken {
  iss: string;
  sub: string;
  aud: string;
  exp: number;
  iat: number;
  auth_time?: number;
  nonce?: string;
  amr?: string[];
  name?: string;
  picture?: string;
  email?: string;
}
