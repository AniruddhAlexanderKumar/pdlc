export function UINatureBackground() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 bg-[#f5f3ec]" />
      <div className="absolute -left-48 top-28 size-[30rem] rounded-full bg-[#e6e9dc]/50 blur-3xl" />
      <div className="absolute -right-52 top-[38rem] size-[34rem] rounded-full bg-[#efe0d3]/35 blur-3xl" />
      <div className="absolute inset-0 opacity-[0.16] [background-image:linear-gradient(to_right,#d7d4ca_1px,transparent_1px),linear-gradient(to_bottom,#d7d4ca_1px,transparent_1px)] [background-size:72px_72px] [mask-image:linear-gradient(to_bottom,black,transparent_72%)]" />
    </div>
  );
}
