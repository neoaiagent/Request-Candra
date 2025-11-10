// API Configuration
export const API_CONFIG = {
  FAL_AI: {
    API_KEY: 'd553a209-c568-427f-b5b3-8da00e6ffa76:09367d608840403363750920e23e1038', // Add your fal.ai API key here (required for image-to-video tool)
    PIKA: {
      BASE_URL: 'https://queue.fal.run/fal-ai/pika/v2.2/pikascenes',
      STATUS_URL: 'https://queue.fal.run/fal-ai/pika/requests',
    },
    KLING: {
      BASE_URL: 'https://queue.fal.run/fal-ai/kling-video/v2.5-turbo/pro/image-to-video',
      STATUS_URL: 'https://queue.fal.run/fal-ai/kling-video/requests',
    },
  },
  IMGBB: {
    API_KEY: '267ebeca0eaffa6ecec21e86e5c03afb', // Fixed API key for image upload
    UPLOAD_URL: 'https://api.imgbb.com/1/upload',
  },
  PROMPT_ENHANCE: {
    WEBHOOK_URL: 'https://n8n-teoxahs8xdqn.blueberry.sumopod.my.id/webhook/fed4e326-fe59-4547-a3a9-8633ff5070db',
  },
};

