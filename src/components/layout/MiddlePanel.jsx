import { ReactFlowProvider } from '@xyflow/react'
import FlowCanvas from '../flow/FlowCanvas'

export default function MiddlePanel() {
  return (
    <div className="h-full w-full relative overflow-hidden bg-bg-primary">
      <ReactFlowProvider>
        <FlowCanvas />
      </ReactFlowProvider>
    </div>
  )
}
