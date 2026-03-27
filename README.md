This is a [Next.js](https://nextjs.org) project bootstrapped with `create-next-app`.

## Getting Started

things I want to add: 

fix bug where other model isnt used on chat page (only uses light model) additionally model selection is not preserved from chat start to chat continuation on route page, we should save the model chosen when we start the chat and continue with that one
add confirmation dialogs for deleting chats
lets allow the chat to have a wider max width, not full width still, but more space than it currently can use

file consumption, lite-parse

sub agent workflows such as RPI or deep research assigning tasks 
   for sub agents would be cool to use gpu model as subagents

websearch tools for doing research, agentic looping in that research

reasoning/thinking, learn more about aisdk and loops

ability to build markdown outputs

potentially ability to build more polished reports than that??? 

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open <http://localhost:3000> with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses `next/font` to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.