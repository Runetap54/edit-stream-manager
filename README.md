VideoStream – Professional Video Scene Creation Dashboard

A modern video production platform built with React, Vite, Tailwind CSS, and Supabase.
Transform uploaded photo folders into professional video scenes with AI-powered generation, version management, and an intuitive dashboard.

🚀 Features
Core Functionality

Smart Upload Panel: Drag & drop folder uploads with automatic renaming (projectname1.jpeg, projectname2.jpeg, etc).

Photo Grid Interface: Browse and select start/end frames with cinematic shot types.

AI Scene Generation: Direct integration with Luma Labs API (LUMAAI_API_KEY) for scene creation. Scenes are saved into structured Supabase storage.

Scene Management: Regenerate, track, and highlight versions with linked photos and previews.

Bulk Export: Download all finished scenes in organized ZIP packages.

Real-Time Updates: Live updates to photo grid, scene grid, and video previews via Supabase Realtime.

User & Data Management

Supabase Auth: Email confirmation required for account activation.

Per-User Media Buckets: Each user has dedicated photos/ and scenes/ folders created upon signup.

Account Deletion: Users can delete accounts; media is preserved in a separate deleted_users/ archive folder.

User API Keys: Support for per-user AI API keys (hashed with SHA-256 before storage, never stored in plain text).

Model Flexibility: Dropdown selectors for Luma Labs models, automatically updated as new options are supported.

Keyboard Shortcuts

S – Mark start frame

E – Mark end frame

1-6 – Select shot types (Wide, Medium, Close-up, Extreme Close-up, Over Shoulder, POV)

R – Regenerate scene

Del – Delete scene

Ctrl+Z – Undo last delete (10s window)

Ctrl/Cmd+E – Export all scenes

🛠 Tech Stack

Frontend: React 18, TypeScript, Vite

Styling: Tailwind CSS, shadcn/ui components

Backend: Supabase (Database, Auth, Storage, Edge Functions)

File Uploads: Uppy Dashboard with folder support

AI Integration: Luma Labs Dream Machine API

📋 Prerequisites

Node.js & npm

Supabase Project (create at supabase.com
)

Luma Labs API Key (LUMAAI_API_KEY)

🔧 Environment Setup
SUPABASE_URL=<your-supabase-url>
SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE=<service-role-key>
LUMAAI_API_KEY=<your-luma-api-key>

🗄 Database Setup
Tables

profiles – Users with email confirmation + metadata

scenes – Scene definitions (linked to start/end frames)

scene_versions – Scene version history with video URLs

storage.objects – Supabase bucket objects with RLS

RLS (Row-Level Security)

Users can only read/write their own files in photos/ and scenes/.

Deleted users’ media is automatically moved to deleted_users/.

🚀 Installation & Development
# Clone the repository
git clone <your-repo-url>
cd videostream-dashboard

# Install dependencies
npm install

# Start development server
npm run dev


App available at: https://edit-stream-manager.vercel.app/dashboard?sceneId=6c188c71-b877-4f5b-a877-f5f810783da1

📦 Deployment

Deploy with Vercel, Netlify, or Render.

Add Supabase environment variables in project settings.

Configure Supabase Auth redirect URLs to match your domain.

🔒 Security Features

Supabase Auth with email confirmation

Per-user bucket isolation via RLS

SHA-256 hashing for sensitive keys (user API keys never stored in plain text)

Signed URLs for media access

Input validation with Zod

📖 Usage Guide
For Users

Sign up with email → confirm account

Upload photo folders

Select start/end frames + shot type

Generate scenes (Luma Labs API)

Export final videos

File Organization
media/
├── {user-id}/
│   ├── photos/
│   └── scenes/
├── deleted/
│   ├── {former-user-id}/
│   │   ├── photos/
│   │   └── scenes/

🐛 Troubleshooting

Upload Fails

Ensure image formats are supported

Check Supabase bucket permissions

Scene Generation Issues

Verify LUMAAI_API_KEY is valid

Check Supabase Edge Function logs

Account Pending

Confirm email verification is complete

🔄 Version History

v1.0.0 – Initial refactor: Removed n8n + Gmail SMTP, replaced with direct Luma Labs API integration.

Built with ❤️ using React, Supabase, and Tailwind.
Built with ❤️ using Lovable, React, and Supabase
