import { ReactFlowProvider } from '@xyflow/react'
import FlowCanvas from '../flow/FlowCanvas'
import useWorkspaceStore from '../../store/workspaceStore'

export default function MiddlePanel() {
  const activeProjectId = useWorkspaceStore((s) => s.activeProjectId)
  return (
    <div className="h-full w-full relative overflow-hidden bg-bg-primary">
      <ReactFlowProvider key={activeProjectId || 'no-project'}>
        <FlowCanvas />
      </ReactFlowProvider>
    </div>
  )
}
