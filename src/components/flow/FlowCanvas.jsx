import { useCallback, useMemo, useState } from 'react'
import { ReactFlow, Background, Controls, MiniMap, useReactFlow, MarkerType } from '@xyflow/react'
import { motion } from 'framer-motion'
import { Plus } from 'lucide-react'
import '@xyflow/react/dist/style.css'
import useAppStore from '../../store/useAppStore'
import PayloadTreeNode from './PayloadTreeNode'
import TransformNode from './TransformNode'
import CommandPalette from './CommandPalette'

const nodeTypes = {
  payloadTree: PayloadTreeNode,
  transform: TransformNode,
}

export default function FlowCanvas() {
  const nodes = useAppStore((s) => s.nodes)
  const edges = useAppStore((s) => s.edges)
  const onNodesChange = useAppStore((s) => s.onNodesChange)
  const onEdgesChange = useAppStore((s) => s.onEdgesChange)
  const onConnect = useAppStore((s) => s.onConnect)
  const addTransformNode = useAppStore((s) => s.addTransformNode)
  const highlightedEdgeIds = useAppStore((s) => s.highlightedEdgeIds)
  const setHighlightedEdges = useAppStore((s) => s.setHighlightedEdges)
  const clearHighlightedEdges = useAppStore((s) => s.clearHighlightedEdges)
  const highlightedNodeIds = useAppStore((s) => s.highlightedNodeIds)
  const setHighlightedNodes = useAppStore((s) => s.setHighlightedNodes)
  const lockedEdgeIds = useAppStore((s) => s.lockedEdgeIds)
  const lockEdges = useAppStore((s) => s.lockEdges)
  const unlockEdges = useAppStore((s) => s.unlockEdges)
  const { screenToFlowPosition } = useReactFlow()

  // ── Command Palette state ──
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [palettePos, setPalettePos] = useState({ x: 0, y: 0 })
  const [paletteFlowPos, setPaletteFlowPos] = useState({ x: 0, y: 0 })

  const openPalette = useCallback((screenX, screenY) => {
    const flowPos = screenToFlowPosition({ x: screenX, y: screenY })
    setPalettePos({ x: screenX, y: screenY })
    setPaletteFlowPos(flowPos)
    setPaletteOpen(true)
  }, [screenToFlowPosition])

  const onPaneContextMenu = useCallback((event) => {
    event.preventDefault()
    openPalette(event.clientX, event.clientY)
  }, [openPalette])

  const onPaletteSelect = useCallback((operation) => {
    addTransformNode(operation, paletteFlowPos)
    setPaletteOpen(false)
  }, [addTransformNode, paletteFlowPos])

  const closePalette = useCallback(() => setPaletteOpen(false), [])

  const onFabClick = useCallback((e) => {
    // FAB is a sibling to ReactFlow, so walk up to the shared parent container
    const container = e.currentTarget.closest('.react-flow')
      || e.currentTarget.parentElement?.querySelector('.react-flow')
      || e.currentTarget.parentElement
    const rect = container?.getBoundingClientRect()
    if (!rect) return
    const x = rect.left + rect.width / 2 - 110
    const y = rect.top + rect.height / 2 - 150
    openPalette(x, y)
  }, [openPalette])

  // ── Helpers: find connected edges/nodes ──
  const getConnectedSet = useCallback((edge) => {
    const edgeIds = new Set([edge.id])
    const nodeIds = new Set()

    const addTransformEdges = (nodeId) => {
      const node = nodes.find((n) => n.id === nodeId)
      if (node?.type === 'transform') {
        nodeIds.add(nodeId)
        edges.forEach((e) => {
          if (e.source === nodeId || e.target === nodeId) {
            edgeIds.add(e.id)
            nodeIds.add(e.source)
            nodeIds.add(e.target)
          }
        })
      } else {
        nodeIds.add(nodeId)
      }
    }

    addTransformEdges(edge.source)
    addTransformEdges(edge.target)
    return { edgeIds, nodeIds }
  }, [edges, nodes])

  // ── Edge hover ──
  const onEdgeMouseEnter = useCallback(
    (_event, edge) => {
      if (lockedEdgeIds) return // don't override locked state with hover
      const { edgeIds, nodeIds } = getConnectedSet(edge)
      setHighlightedEdges(edgeIds)
      setHighlightedNodes(nodeIds)
    },
    [getConnectedSet, setHighlightedEdges, setHighlightedNodes, lockedEdgeIds]
  )

  const onEdgeMouseLeave = useCallback(() => {
    if (lockedEdgeIds) return
    clearHighlightedEdges()
  }, [clearHighlightedEdges, lockedEdgeIds])

  // ── Edge click → lock ──
  const onEdgeClick = useCallback(
    (_event, edge) => {
      const { edgeIds, nodeIds } = getConnectedSet(edge)
      lockEdges(edgeIds, nodeIds)
    },
    [getConnectedSet, lockEdges]
  )

  // ── Pane click → unlock ──
  const onPaneClick = useCallback(() => {
    if (lockedEdgeIds) unlockEdges()
  }, [lockedEdgeIds, unlockEdges])

  // ── Node hover ──
  const onNodeMouseEnter = useCallback(
    (_event, node) => {
      if (lockedEdgeIds) return
      if (node.type !== 'transform') return
      const connectedEdgeIds = new Set()
      const connectedNodeIds = new Set([node.id])
      edges.forEach((e) => {
        if (e.source === node.id || e.target === node.id) {
          connectedEdgeIds.add(e.id)
          connectedNodeIds.add(e.source)
          connectedNodeIds.add(e.target)
        }
      })
      if (connectedEdgeIds.size > 0) {
        setHighlightedEdges(connectedEdgeIds)
        setHighlightedNodes(connectedNodeIds)
      }
    },
    [edges, setHighlightedEdges, setHighlightedNodes, lockedEdgeIds]
  )

  const onNodeMouseLeave = useCallback(() => {
    if (lockedEdgeIds) return
    clearHighlightedEdges()
  }, [clearHighlightedEdges, lockedEdgeIds])

  // ── Active highlight set (locked takes priority over hover) ──
  const activeEdgeIds = lockedEdgeIds || highlightedEdgeIds
  const activeNodeIds = lockedEdgeIds ? useAppStore.getState().lockedNodeIds : highlightedNodeIds

  // ── Style edges ──
  const styledEdges = useMemo(() => {
    return edges.map((edge) => {
      const isHighlighted = activeEdgeIds === null || activeEdgeIds.has(edge.id)
      const isLocked = lockedEdgeIds !== null
      const isHoverOrLock = activeEdgeIds !== null

      return {
        ...edge,
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 16,
          height: 16,
          color: 'var(--color-edge)',
        },
        style: {
          stroke: 'var(--color-edge)',
          strokeWidth: isHighlighted ? (isHoverOrLock ? 3 : 2) : 1,
          opacity: isHighlighted ? 1 : 0.1,
          filter: isHoverOrLock && isHighlighted
            ? 'drop-shadow(0 0 8px var(--color-accent-glow))'
            : 'none',
          transition: 'opacity 0.25s ease, stroke-width 0.25s ease, filter 0.25s ease',
        },
      }
    })
  }, [edges, activeEdgeIds, lockedEdgeIds])

  // ── Style nodes (add highlight class) ──
  const styledNodes = useMemo(() => {
    if (!activeNodeIds) return nodes
    return nodes.map((node) => {
      const isHighlighted = activeNodeIds.has(node.id)
      return {
        ...node,
        className: isHighlighted ? 'node-highlighted' : '',
      }
    })
  }, [nodes, activeNodeIds])

  const defaultEdgeOptions = useMemo(
    () => ({
      type: 'smoothstep',
      animated: true,
      pathOptions: { borderRadius: 20 },
      style: { stroke: 'var(--color-edge)', strokeWidth: 2 },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 16,
        height: 16,
        color: 'var(--color-edge)',
      },
    }),
    []
  )

  return (
    <>
      <ReactFlow
        nodes={styledNodes}
        edges={styledEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        onPaneContextMenu={onPaneContextMenu}
        onPaneClick={onPaneClick}
        onEdgeMouseEnter={onEdgeMouseEnter}
        onEdgeMouseLeave={onEdgeMouseLeave}
        onEdgeClick={onEdgeClick}
        onNodeMouseEnter={onNodeMouseEnter}
        onNodeMouseLeave={onNodeMouseLeave}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        proOptions={{ hideAttribution: true }}
        connectionLineStyle={{ stroke: 'var(--color-accent-glow)', strokeWidth: 2 }}
        connectionLineType="smoothstep"
      >
        <Background variant="dots" gap={20} size={1} color="var(--color-dot-grid)" />
        <Controls
          style={{
            borderColor: 'var(--color-border)',
            backgroundColor: 'var(--color-bg-secondary)',
          }}
        />
        <MiniMap
          position="bottom-right"
          nodeColor={(node) => {
            if (node.type === 'transform') return 'var(--color-accent-secondary)'
            if (node.id === 'source-payload') return 'var(--color-accent)'
            return 'var(--color-accent-glow)'
          }}
          maskColor="rgba(0, 0, 0, 0.75)"
          style={{
            width: 140,
            height: 90,
            backgroundColor: 'var(--color-bg-primary)',
            borderWidth: '1px',
            borderStyle: 'solid',
            borderColor: 'var(--color-border)',
            borderRadius: 8,
          }}
        />
      </ReactFlow>

      {/* FAB Button — positioned above MiniMap to avoid overlap */}
      <motion.button
        onClick={onFabClick}
        className="absolute bottom-40 right-3 z-20 flex items-center justify-center rounded-full shadow-xl cursor-pointer"
        style={{
          width: 44,
          height: 44,
          backgroundColor: 'var(--color-bg-secondary)',
          borderWidth: '2px',
          borderStyle: 'solid',
          borderColor: 'var(--color-accent)',
          boxShadow: '0 0 20px var(--color-accent-glow)',
        }}
        whileHover={{
          scale: 1.15,
          boxShadow: '0 0 32px var(--color-accent-glow)',
        }}
        whileTap={{ scale: 0.9 }}
        transition={{ type: 'spring', stiffness: 400, damping: 25 }}
        title="Add Transform (or right-click canvas)"
      >
        <Plus size={20} style={{ color: 'var(--color-accent)' }} />
      </motion.button>

      {/* Command Palette */}
      <CommandPalette
        open={paletteOpen}
        position={palettePos}
        onSelect={onPaletteSelect}
        onClose={closePalette}
      />
    </>
  )
}
