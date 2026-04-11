// Client-safe item + attachment types shared by server serializers and
// client components. Keep this file free of Node-only imports (aws-sdk,
// fs, etc.) so it can be imported from client components without dragging
// server-only modules into the browser bundle.

export type Attachment = {
  id: string;
  itemId: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  url: string;
  urlExpiresAt: string;
  createdAt: string;
};

export type Item = {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  attachments: Attachment[];
};
