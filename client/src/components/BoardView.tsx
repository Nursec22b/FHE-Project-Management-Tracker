import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams } from 'react-router-dom';
import {
  DndContext,
  DragOverlay,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { boards as boardsApi, lists as listsApi, cards as cardsApi } from '../services/api';
import type { Board, List, Card } from '../types';
import CardDetail from './CardDetail';

// ------------------------------------------------------------------ //
//  Colour palette                                                      //
// ------------------------------------------------------------------ //

const COLORS = {
  primary: '#0079BF',
  primaryHover: '#026AA7',
  success: '#61BD4F',
  warning: '#F2D600',
  danger: '#EB5A46',
  bg: '#F4F5F7',
  card: '#FFFFFF',
  text: '#172B4D',
  textSecondary: '#5E6C84',
  listBg: '#EBECF0',
};

// ------------------------------------------------------------------ //
//  Sortable Card                                                       //
// ------------------------------------------------------------------ //

interface SortableCardProps {
  card: Card;
  onClick: () => void;
}

function SortableCard({ card, onClick }: SortableCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: card.id, data: { type: 'card', card } });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    background: COLORS.card,
    borderRadius: 6,
    padding: '8px 10px',
    marginBottom: 8,
    cursor: 'pointer',
    boxShadow: '0 1px 2px rgba(0,0,0,0.12)',
    fontSize: 14,
    color: COLORS.text,
    position: 'relative',
    userSelect: 'none' as const,
  };

  const checkedCount = card.checklists?.reduce(
    (sum, cl) => sum + cl.items.filter((i) => i.isChecked).length,
    0,
  ) ?? 0;
  const totalCount = card.checklists?.reduce(
    (sum, cl) => sum + cl.items.length,
    0,
  ) ?? 0;

  const dueDateStr = card.dueDate
    ? new Date(card.dueDate).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
      })
    : null;

  const isOverdue =
    card.dueDate ? new Date(card.dueDate) < new Date() : false;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      {/* Labels */}
      {card.labels && card.labels.length > 0 && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 6 }}>
          {card.labels.map((l) => (
            <span
              key={l.id}
              style={{
                display: 'inline-block',
                width: 32,
                height: 8,
                borderRadius: 4,
                background: l.color,
              }}
              title={l.name ?? l.color}
            />
          ))}
        </div>
      )}

      {/* Title */}
      <div style={{ fontWeight: 500, wordBreak: 'break-word' as const }}>{card.title}</div>

      {/* Meta row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          marginTop: 6,
          flexWrap: 'wrap',
          fontSize: 12,
          color: COLORS.textSecondary,
        }}
      >
        {dueDateStr && (
          <span
            style={{
              background: isOverdue ? COLORS.danger : '#DFE1E6',
              color: isOverdue ? '#fff' : COLORS.text,
              padding: '2px 6px',
              borderRadius: 3,
              fontSize: 11,
              fontWeight: 500,
            }}
          >
            {dueDateStr}
          </span>
        )}

        {totalCount > 0 && (
          <span
            style={{
              color: checkedCount === totalCount ? COLORS.success : COLORS.textSecondary,
              fontWeight: 500,
            }}
          >
            {checkedCount}/{totalCount}
          </span>
        )}

        {card.attachments && card.attachments.length > 0 && (
          <span>{card.attachments.length} att.</span>
        )}

        {/* Assignee avatars */}
        {card.assignees && card.assignees.length > 0 && (
          <div style={{ display: 'flex', gap: 2, marginLeft: 'auto' }}>
            {card.assignees.slice(0, 3).map((u) => (
              <div
                key={u.id}
                title={u.displayName}
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: '50%',
                  background: COLORS.primary,
                  color: '#fff',
                  fontSize: 10,
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                }}
              >
                {u.avatarUrl ? (
                  <img
                    src={u.avatarUrl}
                    alt={u.displayName}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  u.displayName
                    .split(' ')
                    .map((n) => n[0])
                    .join('')
                    .toUpperCase()
                    .slice(0, 2)
                )}
              </div>
            ))}
            {card.assignees.length > 3 && (
              <span style={{ fontSize: 11, color: COLORS.textSecondary, alignSelf: 'center' }}>
                +{card.assignees.length - 3}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ //
//  Card placeholder rendered in DragOverlay                           //
// ------------------------------------------------------------------ //

function CardOverlay({ card }: { card: Card }) {
  return (
    <div
      style={{
        background: COLORS.card,
        borderRadius: 6,
        padding: '8px 10px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
        fontSize: 14,
        color: COLORS.text,
        maxWidth: 280,
        transform: 'rotate(3deg)',
      }}
    >
      <div style={{ fontWeight: 500 }}>{card.title}</div>
    </div>
  );
}

// ------------------------------------------------------------------ //
//  Droppable List Column                                               //
// ------------------------------------------------------------------ //

interface ListColumnProps {
  list: List;
  onAddCard: (listId: string, title: string) => void;
  onClickCard: (card: Card) => void;
  onEditTitle: (listId: string, title: string) => void;
  onArchiveList: (listId: string) => void;
  onArchiveAllCards?: (listId: string) => void;
}

function ListColumn({
  list,
  onAddCard,
  onClickCard,
  onEditTitle,
  onArchiveList,
  onArchiveAllCards,
}: ListColumnProps) {
  const [addingCard, setAddingCard] = useState(false);
  const [newCardTitle, setNewCardTitle] = useState('');
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(list.title);
  const [showMenu, setShowMenu] = useState(false);

  const cardIds = useMemo(
    () => list.cards.filter((c) => !c.isArchived).map((c) => c.id),
    [list.cards],
  );

  const activeCards = list.cards.filter((c) => !c.isArchived);

  const handleAddCard = () => {
    if (!newCardTitle.trim()) return;
    onAddCard(list.id, newCardTitle.trim());
    setNewCardTitle('');
    setAddingCard(false);
  };

  const handleTitleBlur = () => {
    setEditingTitle(false);
    const trimmed = titleDraft.trim();
    if (trimmed && trimmed !== list.title) {
      onEditTitle(list.id, trimmed);
    } else {
      setTitleDraft(list.title);
    }
  };

  const columnStyle: React.CSSProperties = {
    background: COLORS.listBg,
    borderRadius: 8,
    width: 280,
    minWidth: 280,
    maxHeight: '100%',
    display: 'flex',
    flexDirection: 'column',
    flexShrink: 0,
  };

  return (
    <div style={columnStyle}>
      {/* Header */}
      <div
        style={{
          padding: '10px 12px 6px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 4,
          position: 'relative',
        }}
      >
        {editingTitle ? (
          <input
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={handleTitleBlur}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleTitleBlur();
              if (e.key === 'Escape') {
                setTitleDraft(list.title);
                setEditingTitle(false);
              }
            }}
            autoFocus
            style={{
              flex: 1,
              fontSize: 14,
              fontWeight: 700,
              border: '2px solid ' + COLORS.primary,
              borderRadius: 4,
              padding: '2px 6px',
              outline: 'none',
              background: COLORS.card,
              color: COLORS.text,
            }}
          />
        ) : (
          <div
            style={{
              flex: 1,
              fontSize: 14,
              fontWeight: 700,
              color: COLORS.text,
              cursor: 'pointer',
              padding: '2px 6px',
              borderRadius: 4,
            }}
            onClick={() => setEditingTitle(true)}
          >
            {list.title}
            {activeCards.length > 0 && (
              <span style={{ fontWeight: 400, color: COLORS.textSecondary, marginLeft: 6, fontSize: 12 }}>
                {activeCards.length}
              </span>
            )}
          </div>
        )}

        {/* List menu button */}
        <button
          onClick={() => setShowMenu(!showMenu)}
          title="List actions"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: 16,
            color: COLORS.textSecondary,
            padding: '2px 6px',
            lineHeight: 1,
            borderRadius: 4,
          }}
        >
          &#8230;
        </button>

        {/* Dropdown menu */}
        {showMenu && (
          <div
            style={{
              position: 'absolute',
              top: 36,
              right: 8,
              background: COLORS.card,
              border: '1px solid #DFE1E6',
              borderRadius: 6,
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              zIndex: 20,
              minWidth: 200,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                padding: '8px 12px',
                borderBottom: '1px solid #DFE1E6',
                fontSize: 12,
                fontWeight: 700,
                color: COLORS.text,
                textAlign: 'center',
              }}
            >
              List Actions
            </div>

            {/* Archive all cards option */}
            {activeCards.length > 0 && onArchiveAllCards && (
              <button
                onClick={() => {
                  setShowMenu(false);
                  onArchiveAllCards(list.id);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  width: '100%',
                  padding: '10px 12px',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 13,
                  color: COLORS.text,
                  textAlign: 'left',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#F4F5F7';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                <span style={{ fontSize: 16 }}>&#128451;</span>
                Archive all cards ({activeCards.length})
              </button>
            )}

            {/* Archive list option */}
            <button
              onClick={() => {
                setShowMenu(false);
                onArchiveList(list.id);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                width: '100%',
                padding: '10px 12px',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: 13,
                color: COLORS.danger,
                textAlign: 'left',
                transition: 'background 0.15s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#FFF0F0';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
              }}
            >
              <span style={{ fontSize: 16 }}>&times;</span>
              Archive this list
            </button>
          </div>
        )}

        {/* Close menu on outside click */}
        {showMenu && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 19,
            }}
            onClick={() => setShowMenu(false)}
          />
        )}
      </div>

      {/* Cards area */}
      <div
        style={{
          padding: '0 8px',
          overflowY: 'auto',
          flex: 1,
          minHeight: 4,
        }}
      >
        <SortableContext items={cardIds} strategy={verticalListSortingStrategy}>
          {activeCards.map((card) => (
            <SortableCard
              key={card.id}
              card={card}
              onClick={() => onClickCard(card)}
            />
          ))}
        </SortableContext>
      </div>

      {/* Add card */}
      <div style={{ padding: '4px 8px 8px' }}>
        {addingCard ? (
          <div>
            <textarea
              value={newCardTitle}
              onChange={(e) => setNewCardTitle(e.target.value)}
              placeholder="Enter a title for this card..."
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleAddCard();
                }
                if (e.key === 'Escape') setAddingCard(false);
              }}
              style={{
                width: '100%',
                minHeight: 54,
                padding: '8px 10px',
                fontSize: 14,
                border: 'none',
                borderRadius: 6,
                resize: 'none',
                outline: 'none',
                boxSizing: 'border-box',
                boxShadow: '0 1px 2px rgba(0,0,0,0.12)',
                color: COLORS.text,
              }}
            />
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              <button
                onClick={handleAddCard}
                style={{
                  padding: '6px 14px',
                  background: COLORS.primary,
                  color: '#fff',
                  border: 'none',
                  borderRadius: 4,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Add Card
              </button>
              <button
                onClick={() => setAddingCard(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: 18,
                  cursor: 'pointer',
                  color: COLORS.textSecondary,
                  lineHeight: 1,
                }}
              >
                &times;
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setAddingCard(true)}
            style={{
              width: '100%',
              background: 'none',
              border: 'none',
              padding: '6px 8px',
              textAlign: 'left',
              fontSize: 13,
              color: COLORS.textSecondary,
              cursor: 'pointer',
              borderRadius: 6,
              transition: 'background 0.15s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(0,0,0,0.06)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
            }}
          >
            + Add a card
          </button>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ //
//  BoardView (main component)                                          //
// ------------------------------------------------------------------ //

export default function BoardView() {
  const { boardId } = useParams<{ boardId: string }>();

  const [board, setBoard] = useState<Board | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);

  // Add list state
  const [addingList, setAddingList] = useState(false);
  const [newListTitle, setNewListTitle] = useState('');

  // Archive feedback
  const [archiveMessage, setArchiveMessage] = useState<string | null>(null);

  // Search
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Array<{
    id: string; title: string; description: string | null;
    isArchived: boolean; listId: string; listTitle: string;
  }>>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  // Active drag item
  const [activeCard, setActiveCard] = useState<Card | null>(null);

  // Ref for the columns wrapper — used for click-and-drag horizontal scroll
  const columnsRef = useRef<HTMLDivElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  // ---------------------------------------------------------------- //
  //  Fetch board data                                                  //
  // ---------------------------------------------------------------- //

  const fetchBoard = useCallback(async () => {
    if (!boardId) return;
    try {
      setLoading(true);
      const data = await boardsApi.getById(boardId);
      // Sort lists by position, and cards within each list by position
      data.lists = (data.lists || [])
        .filter((l) => !l.isArchived)
        .sort((a, b) => a.position - b.position)
        .map((l) => ({
          ...l,
          cards: (l.cards || []).sort((a, b) => a.position - b.position),
        }));
      setBoard(data);
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load board');
    } finally {
      setLoading(false);
    }
  }, [boardId]);

  useEffect(() => {
    fetchBoard();
  }, [fetchBoard]);

  // Auto-dismiss archive message after 4 seconds
  useEffect(() => {
    if (archiveMessage) {
      const timer = setTimeout(() => setArchiveMessage(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [archiveMessage]);

  // Search handler (debounced via useEffect)
  useEffect(() => {
    if (!showSearch || !searchQuery.trim() || !boardId) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const results = await boardsApi.search(boardId, searchQuery.trim());
        setSearchResults(results);
      } catch {
        // ignore
      } finally {
        setSearchLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, showSearch, boardId]);

  const handleRestoreCard = async (cardId: string, targetListId: string) => {
    setRestoringId(cardId);
    try {
      await cardsApi.unarchive(cardId, targetListId);
      await fetchBoard();
      // Remove the restored card from search results
      setSearchResults((prev) => prev.filter((r) => r.id !== cardId));
    } catch {
      // ignore
    } finally {
      setRestoringId(null);
    }
  };

  // ---------------------------------------------------------------- //
  //  Helpers: find list that contains a given card/item ID             //
  // ---------------------------------------------------------------- //

  const findListContainingCard = useCallback(
    (cardId: string): List | undefined => {
      if (!board) return undefined;
      // The cardId may be a list droppable id
      const directList = board.lists.find((l) => l.id === cardId);
      if (directList) return directList;
      return board.lists.find((l) =>
        l.cards.some((c) => c.id === cardId),
      );
    },
    [board],
  );

  // ---------------------------------------------------------------- //
  //  Drag handlers                                                     //
  // ---------------------------------------------------------------- //

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const { active } = event;
      const data = active.data.current;
      if (data?.type === 'card') {
        setActiveCard(data.card as Card);
      }
    },
    [],
  );

  const handleDragOver = useCallback(
    (event: DragOverEvent) => {
      const { active, over } = event;
      if (!over || !board) return;

      const activeList = findListContainingCard(active.id as string);
      const overList = findListContainingCard(over.id as string);

      if (!activeList || !overList || activeList.id === overList.id) return;

      // Move the card from one list to another in local state
      setBoard((prev) => {
        if (!prev) return prev;
        const card = activeList.cards.find((c) => c.id === active.id);
        if (!card) return prev;

        const newLists = prev.lists.map((l) => {
          if (l.id === activeList.id) {
            return { ...l, cards: l.cards.filter((c) => c.id !== active.id) };
          }
          if (l.id === overList.id) {
            const overIndex = l.cards.findIndex((c) => c.id === over.id);
            const insertIdx = overIndex >= 0 ? overIndex : l.cards.length;
            const newCards = [...l.cards];
            newCards.splice(insertIdx, 0, { ...card, listId: l.id });
            return { ...l, cards: newCards };
          }
          return l;
        });
        return { ...prev, lists: newLists };
      });
    },
    [board, findListContainingCard],
  );

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      setActiveCard(null);
      const { active, over } = event;
      if (!over || !board) return;

      // active.data.current.card was captured at drag-start and never mutated
      // by handleDragOver, so it still has the ORIGINAL listId
      const originalListId = (active.data.current?.card as Card | undefined)?.listId;

      // After handleDragOver ran, the card is now in the target list in state
      const currentList = findListContainingCard(active.id as string);

      if (!currentList || !originalListId) { fetchBoard(); return; }

      if (originalListId === currentList.id) {
        // ── Same-list reorder ────────────────────────────────────────
        const oldIndex = currentList.cards.findIndex((c) => c.id === active.id);
        const newIndex = currentList.cards.findIndex((c) => c.id === over.id);

        if (oldIndex !== newIndex && oldIndex >= 0 && newIndex >= 0) {
          const reordered = arrayMove(currentList.cards, oldIndex, newIndex);
          setBoard((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              lists: prev.lists.map((l) =>
                l.id === currentList.id ? { ...l, cards: reordered } : l,
              ),
            };
          });
          try {
            await cardsApi.move(active.id as string, {
              targetListId: currentList.id,
              newPosition: newIndex,
            });
          } catch {
            fetchBoard();
          }
        }
      } else {
        // ── Cross-list move (card already moved optimistically by handleDragOver)
        const newIndex = currentList.cards.findIndex((c) => c.id === active.id);
        const position = newIndex >= 0 ? newIndex : currentList.cards.length - 1;
        try {
          await cardsApi.move(active.id as string, {
            targetListId: currentList.id,
            newPosition: position,
          });
        } catch {
          fetchBoard();
        }
      }
    },
    [board, findListContainingCard, fetchBoard],
  );

  // ---------------------------------------------------------------- //
  //  Board-level actions                                               //
  // ---------------------------------------------------------------- //

  const handleAddList = async () => {
    if (!newListTitle.trim() || !boardId) return;
    try {
      const created = await listsApi.create({
        boardId,
        title: newListTitle.trim(),
      });
      setBoard((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          lists: [...prev.lists, { ...created, cards: created.cards || [] }],
        };
      });
      setNewListTitle('');
      setAddingList(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create list');
    }
  };

  const handleAddCard = async (listId: string, title: string) => {
    try {
      const created = await cardsApi.create({ listId, title });
      setBoard((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          lists: prev.lists.map((l) =>
            l.id === listId
              ? {
                  ...l,
                  cards: [
                    ...l.cards,
                    {
                      ...created,
                      labels: created.labels || [],
                      assignees: created.assignees || [],
                      checklists: created.checklists || [],
                      attachments: created.attachments || [],
                      comments: created.comments || [],
                    },
                  ],
                }
              : l,
          ),
        };
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create card');
    }
  };

  const handleEditListTitle = async (listId: string, title: string) => {
    try {
      await listsApi.update(listId, { title });
      setBoard((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          lists: prev.lists.map((l) => (l.id === listId ? { ...l, title } : l)),
        };
      });
    } catch {
      // ignore
    }
  };

  const handleArchiveList = async (listId: string) => {
    if (!window.confirm('Archive this list?')) return;
    try {
      await listsApi.archive(listId);
      setBoard((prev) => {
        if (!prev) return prev;
        return { ...prev, lists: prev.lists.filter((l) => l.id !== listId) };
      });
    } catch {
      // ignore
    }
  };

  // ---------------------------------------------------------------- //
  //  Archive all cards in a list                                       //
  // ---------------------------------------------------------------- //

  const handleArchiveAllCards = async (listId: string) => {
    if (!board) return;

    const list = board.lists.find((l) => l.id === listId);
    if (!list) return;

    const activeCards = list.cards.filter((c) => !c.isArchived);
    if (activeCards.length === 0) return;

    const confirmed = window.confirm(
      `Archive all ${activeCards.length} card(s) in "${list.title}"?\n\nThis will remove them from the board view.`
    );
    if (!confirmed) return;

    try {
      const result = await listsApi.archiveAllCards(listId);

      // Remove all cards from the list in local state
      setBoard((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          lists: prev.lists.map((l) =>
            l.id === listId ? { ...l, cards: [] } : l,
          ),
        };
      });

      setArchiveMessage(result.message);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to archive cards');
    }
  };

  const handleClickCard = (card: Card) => {
    setSelectedCard(card);
  };

  const handleCardUpdated = useCallback(
    (updatedCard: Card) => {
      setSelectedCard(updatedCard);
      setBoard((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          lists: prev.lists.map((l) => ({
            ...l,
            cards: l.cards.map((c) => (c.id === updatedCard.id ? updatedCard : c)),
          })),
        };
      });
    },
    [],
  );

  const handleCardArchived = useCallback(
    (cardId: string) => {
      setSelectedCard(null);
      setBoard((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          lists: prev.lists.map((l) => ({
            ...l,
            cards: l.cards.filter((c) => c.id !== cardId),
          })),
        };
      });
    },
    [],
  );

  const handleCardMoved = useCallback(
    (cardId: string, newListId: string) => {
      setBoard((prev) => {
        if (!prev) return prev;
        let movedCard: Card | undefined;
        const listsWithoutCard = prev.lists.map((l) => {
          const found = l.cards.find((c) => c.id === cardId);
          if (found) movedCard = { ...found, listId: newListId };
          return { ...l, cards: l.cards.filter((c) => c.id !== cardId) };
        });
        if (!movedCard) return prev;
        const card = movedCard;
        return {
          ...prev,
          lists: listsWithoutCard.map((l) =>
            l.id === newListId ? { ...l, cards: [...l.cards, card] } : l,
          ),
        };
      });
    },
    [],
  );

  // ---------------------------------------------------------------- //
  //  Find the "Completed Lots" list for the quick-archive button       //
  // ---------------------------------------------------------------- //

  const completedLotsList = useMemo(() => {
    if (!board) return null;
    return board.lists.find(
      (l) => l.title.toLowerCase() === 'completed lots',
    ) ?? null;
  }, [board]);

  const completedLotsCardCount = useMemo(() => {
    if (!completedLotsList) return 0;
    return completedLotsList.cards.filter((c) => !c.isArchived).length;
  }, [completedLotsList]);

  // ---------------------------------------------------------------- //
  //  Styles                                                            //
  // ---------------------------------------------------------------- //

  const bgColor = board?.backgroundColor || COLORS.primary;

  const styles: Record<string, React.CSSProperties> = {
    page: {
      flex: 1,
      minHeight: 0,
      display: 'flex',
      flexDirection: 'column',
      background: bgColor,
      overflow: 'hidden',
    },
    boardHeader: {
      display: 'flex',
      alignItems: 'center',
      padding: '10px 16px',
      gap: 16,
    },
    boardTitle: {
      fontSize: 18,
      fontWeight: 700,
      color: '#fff',
    },
    boardMembers: {
      display: 'flex',
      gap: 4,
    },
    memberBubble: {
      width: 28,
      height: 28,
      borderRadius: '50%',
      background: 'rgba(255,255,255,0.3)',
      color: '#fff',
      fontSize: 11,
      fontWeight: 700,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    columnsWrapper: {
      flex: 1,
      minHeight: 0,
      display: 'flex',
      overflowX: 'auto',
      overflowY: 'hidden',
      padding: '0 16px 16px',
      gap: 12,
      alignItems: 'flex-start',
    },
    addListBtn: {
      minWidth: 280,
      width: 280,
      flexShrink: 0,
      background: 'rgba(255,255,255,0.24)',
      borderRadius: 8,
      padding: 12,
      color: '#fff',
      fontSize: 14,
      fontWeight: 500,
      cursor: 'pointer',
      border: 'none',
      textAlign: 'left' as const,
      transition: 'background 0.15s',
    },
    addListForm: {
      minWidth: 280,
      width: 280,
      flexShrink: 0,
      background: COLORS.listBg,
      borderRadius: 8,
      padding: 8,
    },
    loadingMsg: {
      color: '#fff',
      fontSize: 14,
      textAlign: 'center' as const,
      padding: 60,
    },
    errorMsg: {
      color: '#fff',
      background: 'rgba(235,90,70,0.8)',
      padding: '10px 14px',
      borderRadius: 4,
      margin: '0 16px 8px',
      fontSize: 13,
    },
    archiveBtn: {
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      padding: '6px 14px',
      background: 'rgba(255,255,255,0.2)',
      border: '1px solid rgba(255,255,255,0.3)',
      borderRadius: 6,
      color: '#fff',
      fontSize: 13,
      fontWeight: 600,
      cursor: 'pointer',
      transition: 'all 0.15s',
      whiteSpace: 'nowrap' as const,
    },
    archiveBtnDisabled: {
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      padding: '6px 14px',
      background: 'rgba(255,255,255,0.08)',
      border: '1px solid rgba(255,255,255,0.15)',
      borderRadius: 6,
      color: 'rgba(255,255,255,0.4)',
      fontSize: 13,
      fontWeight: 600,
      cursor: 'not-allowed',
      whiteSpace: 'nowrap' as const,
    },
    successToast: {
      position: 'fixed' as const,
      top: 70,
      right: 20,
      background: '#61BD4F',
      color: '#fff',
      padding: '12px 20px',
      borderRadius: 8,
      boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
      fontSize: 14,
      fontWeight: 600,
      zIndex: 9999,
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      animation: 'slideIn 0.3s ease',
    },
  };

  // ---------------------------------------------------------------- //
  //  Render                                                            //
  // ---------------------------------------------------------------- //

  if (loading) {
    return (
      <div style={{ ...styles.page, justifyContent: 'center', alignItems: 'center' }}>
        <div style={styles.loadingMsg}>Loading board...</div>
      </div>
    );
  }

  if (error || !board) {
    return (
      <div style={{ ...styles.page, justifyContent: 'center', alignItems: 'center' }}>
        <div style={styles.errorMsg}>{error || 'Board not found'}</div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      {/* Toast for archive success */}
      {archiveMessage && (
        <div style={styles.successToast}>
          <span>&#10003;</span>
          {archiveMessage}
        </div>
      )}

      {/* Board header */}
      <div style={styles.boardHeader}>
        <div style={styles.boardTitle}>{board.title}</div>

        <div style={styles.boardMembers}>
          {board.members?.slice(0, 6).map((m) => {
            const name = m.displayName || m.user?.displayName || '?';
            const initials = name
              .split(' ')
              .map((n) => n[0])
              .join('')
              .toUpperCase()
              .slice(0, 2);
            const url = m.avatarUrl ?? m.user?.avatarUrl;
            return (
              <div key={m.userId} style={styles.memberBubble} title={name}>
                {url ? (
                  <img
                    src={url}
                    alt={name}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }}
                  />
                ) : (
                  initials
                )}
              </div>
            );
          })}
          {(board.members?.length ?? 0) > 6 && (
            <div style={{ ...styles.memberBubble, background: 'rgba(255,255,255,0.15)', fontSize: 10 }}>
              +{(board.members?.length ?? 0) - 6}
            </div>
          )}
        </div>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Search button */}
        <button
          onClick={() => { setShowSearch(true); setSearchQuery(''); setSearchResults([]); }}
          style={{
            background: 'rgba(255,255,255,0.2)',
            border: 'none',
            borderRadius: 4,
            color: '#fff',
            padding: '6px 14px',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            marginRight: 8,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.35)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.2)'; }}
        >
          &#128269; Search
        </button>

        {/* Archive Completed Lots button */}
        {completedLotsList && (
          <button
            style={completedLotsCardCount > 0 ? styles.archiveBtn : styles.archiveBtnDisabled}
            disabled={completedLotsCardCount === 0}
            onClick={() => {
              if (completedLotsList && completedLotsCardCount > 0) {
                handleArchiveAllCards(completedLotsList.id);
              }
            }}
            onMouseEnter={(e) => {
              if (completedLotsCardCount > 0) {
                e.currentTarget.style.background = 'rgba(255,255,255,0.35)';
              }
            }}
            onMouseLeave={(e) => {
              if (completedLotsCardCount > 0) {
                e.currentTarget.style.background = 'rgba(255,255,255,0.2)';
              }
            }}
            title={
              completedLotsCardCount > 0
                ? `Archive ${completedLotsCardCount} card(s) from Completed Lots`
                : 'No cards in Completed Lots'
            }
          >
            <span style={{ fontSize: 16 }}>&#128451;</span>
            Archive Completed Lots
            {completedLotsCardCount > 0 && (
              <span
                style={{
                  background: 'rgba(255,255,255,0.3)',
                  padding: '1px 8px',
                  borderRadius: 10,
                  fontSize: 12,
                }}
              >
                {completedLotsCardCount}
              </span>
            )}
          </button>
        )}
      </div>

      {error && <div style={styles.errorMsg}>{error}</div>}

      {/* Columns */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div
          ref={columnsRef}
          style={{ ...styles.columnsWrapper, cursor: 'grab' }}
          onMouseDown={(e) => {
            // Don't hijack clicks on cards, buttons, inputs, or text
            const tag = (e.target as HTMLElement).tagName;
            if (['BUTTON', 'INPUT', 'TEXTAREA', 'A', 'SELECT'].includes(tag)) return;
            if ((e.target as HTMLElement).closest('[data-nodrag]')) return;
            // Only activate on left-click on the background / list background
            if (e.button !== 0) return;
            const el = columnsRef.current;
            if (!el) return;
            const startX = e.pageX;
            const startScroll = el.scrollLeft;
            el.style.cursor = 'grabbing';
            el.style.userSelect = 'none';
            const onMove = (me: MouseEvent) => {
              el.scrollLeft = startScroll - (me.pageX - startX);
            };
            const onUp = () => {
              el.style.cursor = 'grab';
              el.style.userSelect = '';
              document.removeEventListener('mousemove', onMove);
              document.removeEventListener('mouseup', onUp);
            };
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
          }}
        >
          {board.lists.map((list) => (
            <SortableContext
              key={list.id}
              items={list.cards.filter((c) => !c.isArchived).map((c) => c.id)}
              strategy={verticalListSortingStrategy}
            >
              <ListColumn
                list={list}
                onAddCard={handleAddCard}
                onClickCard={handleClickCard}
                onEditTitle={handleEditListTitle}
                onArchiveList={handleArchiveList}
                onArchiveAllCards={handleArchiveAllCards}
              />
            </SortableContext>
          ))}

          {/* Add list */}
          {addingList ? (
            <div style={styles.addListForm}>
              <input
                value={newListTitle}
                onChange={(e) => setNewListTitle(e.target.value)}
                placeholder="Enter list title..."
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddList();
                  if (e.key === 'Escape') setAddingList(false);
                }}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  fontSize: 14,
                  border: '2px solid ' + COLORS.primary,
                  borderRadius: 4,
                  outline: 'none',
                  boxSizing: 'border-box',
                  marginBottom: 6,
                  color: COLORS.text,
                }}
              />
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  onClick={handleAddList}
                  style={{
                    padding: '6px 14px',
                    background: COLORS.primary,
                    color: '#fff',
                    border: 'none',
                    borderRadius: 4,
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Add List
                </button>
                <button
                  onClick={() => setAddingList(false)}
                  style={{
                    background: 'none',
                    border: 'none',
                    fontSize: 18,
                    cursor: 'pointer',
                    color: COLORS.textSecondary,
                    lineHeight: 1,
                  }}
                >
                  &times;
                </button>
              </div>
            </div>
          ) : (
            <button
              style={styles.addListBtn}
              onClick={() => setAddingList(true)}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.32)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.24)';
              }}
            >
              + Add another list
            </button>
          )}
        </div>

        <DragOverlay>
          {activeCard ? <CardOverlay card={activeCard} /> : null}
        </DragOverlay>
      </DndContext>

      {/* Card detail modal */}
      {selectedCard && (
        <CardDetail
          card={selectedCard}
          board={board}
          onClose={() => setSelectedCard(null)}
          onCardUpdated={handleCardUpdated}
          onCardArchived={handleCardArchived}
          onCardMoved={handleCardMoved}
        />
      )}

      {/* Search modal */}
      {showSearch && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
            display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
            zIndex: 3000, padding: '60px 16px',
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowSearch(false); }}
        >
          <div style={{
            background: '#fff', borderRadius: 8, width: '100%', maxWidth: 560,
            maxHeight: '80vh', display: 'flex', flexDirection: 'column',
            boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
          }}>
            {/* Search input */}
            <div style={{ padding: '16px 16px 0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  autoFocus
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search cards by title or description..."
                  style={{
                    flex: 1, padding: '10px 14px', fontSize: 15,
                    border: '2px solid #0079BF', borderRadius: 6,
                    outline: 'none', color: '#172B4D',
                  }}
                  onKeyDown={(e) => { if (e.key === 'Escape') setShowSearch(false); }}
                />
                <button
                  onClick={() => setShowSearch(false)}
                  style={{
                    background: 'none', border: 'none', fontSize: 22,
                    cursor: 'pointer', color: '#5E6C84', padding: '0 4px',
                  }}
                >&times;</button>
              </div>
              <div style={{ fontSize: 12, color: '#5E6C84', marginTop: 6, marginBottom: 12 }}>
                Searches active and archived cards. Click a card to open it, or restore archived cards.
              </div>
            </div>

            {/* Results */}
            <div style={{ overflowY: 'auto', padding: '0 16px 16px' }}>
              {searchLoading && (
                <div style={{ textAlign: 'center', padding: 24, color: '#5E6C84', fontSize: 14 }}>
                  Searching...
                </div>
              )}

              {!searchLoading && searchQuery.trim() && searchResults.length === 0 && (
                <div style={{ textAlign: 'center', padding: 24, color: '#5E6C84', fontSize: 14 }}>
                  No cards found.
                </div>
              )}

              {!searchLoading && searchResults.map((result) => (
                <div
                  key={result.id}
                  style={{
                    border: '1px solid #DFE1E6', borderRadius: 6, padding: '10px 12px',
                    marginBottom: 8, background: result.isArchived ? '#F8F9FA' : '#fff',
                    display: 'flex', alignItems: 'flex-start', gap: 10,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                      {result.isArchived && (
                        <span style={{
                          fontSize: 10, fontWeight: 700, background: '#DFE1E6',
                          color: '#5E6C84', padding: '1px 6px', borderRadius: 3,
                        }}>
                          ARCHIVED
                        </span>
                      )}
                      <span style={{
                        fontSize: 13, fontWeight: 600, color: '#172B4D',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {result.title}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: '#5E6C84' }}>
                      List: {result.listTitle}
                    </div>
                    {result.description && (
                      <div style={{
                        fontSize: 12, color: '#5E6C84', marginTop: 2,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {result.description}
                      </div>
                    )}
                  </div>

                  {result.isArchived ? (
                    <button
                      disabled={restoringId === result.id}
                      onClick={() => handleRestoreCard(result.id, result.listId)}
                      style={{
                        padding: '5px 12px', background: '#61BD4F', color: '#fff',
                        border: 'none', borderRadius: 4, fontSize: 12, fontWeight: 600,
                        cursor: restoringId === result.id ? 'wait' : 'pointer',
                        opacity: restoringId === result.id ? 0.7 : 1, flexShrink: 0,
                      }}
                    >
                      {restoringId === result.id ? 'Restoring...' : 'Restore'}
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        // Find the card in the board and open it
                        const list = board.lists.find((l) => l.id === result.listId);
                        const card = list?.cards.find((c) => c.id === result.id);
                        if (card) { setSelectedCard(card); setShowSearch(false); }
                      }}
                      style={{
                        padding: '5px 12px', background: '#0079BF', color: '#fff',
                        border: 'none', borderRadius: 4, fontSize: 12, fontWeight: 600,
                        cursor: 'pointer', flexShrink: 0,
                      }}
                    >
                      Open
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
