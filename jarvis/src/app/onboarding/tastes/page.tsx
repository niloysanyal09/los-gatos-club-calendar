import TasteGame from "./TasteGame";

export default function TastesPage() {
  return (
    <div>
      <h1>This or that? 🎯</h1>
      <p className="sub">
        Quick game — tap whichever you&apos;d actually do. Eight rounds, no wrong
        answers. Jarvis uses this to nail your first week of picks.
      </p>
      <TasteGame />
    </div>
  );
}
