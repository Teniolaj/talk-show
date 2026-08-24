import Image from "next/image";

const studioImage = "https://images.unsplash.com/photo-1756489947258-b7774b7671ff?auto=format&fit=crop&fm=jpg&ixlib=rb-4.1.0&q=85&w=1600";

export default function BrandVisual() {
  return (
    <aside className="auth-visual relative hidden overflow-hidden lg:block">
      <Image
        src={studioImage}
        alt="Studio microphone ready for a live talk show"
        fill
        priority
        sizes="50vw"
        className="object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-[#122822] via-[#122822]/55 to-[#122822]/10" />
      <div className="absolute inset-x-0 bottom-0 p-12 text-white">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#f7b4a4]">Talkshow studio</p>
        <h2 className="mt-4 max-w-md text-4xl font-semibold leading-tight tracking-tight">Make every live conversation count.</h2>
        <p className="mt-4 max-w-md text-base leading-7 text-white/70">A calm control room for hosts, producers, and the stories worth sharing.</p>
        <div className="mt-8 flex items-center gap-3 text-sm text-white/80">
          <span className="h-2 w-2 animate-pulse rounded-full bg-[#f16c4d]" />
          Live context, right when you need it
        </div>
      </div>
    </aside>
  );
}
