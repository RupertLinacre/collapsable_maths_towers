import { defineConfig } from 'vite';
import { imagetools } from 'vite-imagetools';

export default defineConfig({
    plugins: [
        imagetools({
            defaultDirectives: new URLSearchParams({
                format: 'webp',
                w: '800',
                quality: '60'
            })
        })
    ]
});
