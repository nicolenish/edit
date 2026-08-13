import GraphDesk from './features/graph/GraphDesk'

// Nishi is the taste graph — a full-bleed workspace and the whole app. The earlier
// browse-app (What's New / Almanac / Boards / Diary / Discover) has been retired; the
// graph takes over every route, so "/" lands here too, not just "/graph".
export default function App() {
  return <GraphDesk />
}
