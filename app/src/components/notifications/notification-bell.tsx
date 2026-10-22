"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Bell, X, Check, ChevronRight } from "lucide-react";
import { useRouter, usePathname } from "next/navigation";
import type { Notification, NotificationType, NotificationRefType, NotificationListResult } from "@/types/notification";
import {
  NOTIFICATION_TYPE_COLORS,
  NOTIFICATION_TYPE_LABELS,
  NOTIFICATION_REF_TYPE_LABELS,
  NOTIFICATION_ROUTES,
} from "@/types/notification";

interface NotificationBellProps {
  initialUnreadCount?: number;
}

export function NotificationBell({ initialUnreadCount = 0 }: NotificationBellProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const pathname = usePathname();
  const isInitialMount = useRef(true);

  // Fetch unread count
  const fetchUnreadCount = useCallback(async () => {
    try {
      const response = await fetch("/api/notifications/unread-count");
      if (response.ok) {
        const data = await response.json();
        setUnreadCount(data.count ?? 0);
      }
    } catch (error) {
      console.error("Failed to fetch unread count:", error);
    }
  }, []);

  // Fetch notifications
  const fetchNotifications = useCallback(async (pageNum = 0, append = false) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        limit: "20",
        offset: String(pageNum * 20),
        unread_only: "false",
      });
      const response = await fetch(`/api/notifications?${params}`);
      if (response.ok) {
        const data: NotificationListResult = await response.json();
        if (append) {
          setNotifications(prev => [...prev, ...data.notifications]);
        } else {
          setNotifications(data.notifications);
        }
        setHasMore(data.notifications.length === 20);
        setPage(pageNum);
      }
    } catch (error) {
      console.error("Failed to fetch notifications:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Load unread count on mount and route changes
  useEffect(() => {
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 60000);
    return () => clearInterval(interval);
  }, [fetchUnreadCount, pathname]);

  // Load notifications whenever dropdown opens
  useEffect(() => {
    if (isOpen) {
      fetchNotifications(0, false);
      fetchUnreadCount();
    }
  }, [isOpen, fetchNotifications, fetchUnreadCount]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Handle scroll for infinite scroll
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    if (target.scrollTop + target.clientHeight >= target.scrollHeight - 100) {
      if (hasMore && !isLoading) {
        fetchNotifications(page + 1, true);
      }
    }
  }, [hasMore, isLoading, page, fetchNotifications]);

  const handleMarkRead = async (notificationId: string) => {
    try {
      const response = await fetch("/api/notifications/mark-read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notificationId }),
      });
      if (response.ok) {
        setNotifications(prev =>
          prev.map(n => n.id === notificationId ? { ...n, is_read: true, read_at: new Date().toISOString() } : n)
        );
        setUnreadCount(prev => Math.max(0, prev - 1));
      }
    } catch (error) {
      console.error("Failed to mark as read:", error);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      const response = await fetch("/api/notifications/mark-all-read", {
        method: "POST",
      });
      if (response.ok) {
        const data = await response.json();
        setNotifications(prev => prev.map(n => ({ ...n, is_read: true, read_at: new Date().toISOString() })));
        setUnreadCount(0);
      }
    } catch (error) {
      console.error("Failed to mark all as read:", error);
    }
  };

  const handleNotificationClick = (notification: Notification) => {
    const route = NOTIFICATION_ROUTES[notification.ref_type];
    if (route) {
      router.push(route(notification.ref_id));
      setIsOpen(false);
      if (!notification.is_read) {
        handleMarkRead(notification.id);
      }
    }
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
        aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ""}`}
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-semibold text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="fixed inset-x-3 top-16 sm:absolute sm:inset-auto sm:right-0 sm:top-auto sm:mt-2 w-auto sm:w-96 origin-top-right rounded-lg bg-white shadow-xl ring-1 ring-gray-900/10 animate-in fade-in-0 zoom-in-95 duration-150 z-50">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
            <h3 className="text-sm font-semibold text-gray-900">Notifications</h3>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={handleMarkAllRead}
                  className="text-xs font-medium text-[var(--accent)] hover:underline"
                >
                  Mark all read
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-1 text-gray-400 hover:text-gray-600"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Notification List */}
          <div
            ref={listRef}
            onScroll={handleScroll}
            className="max-h-96 overflow-y-auto"
          >
            {isLoading && notifications.length === 0 && (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-6 w-6 border-2 border-[var(--accent)] border-t-transparent" />
              </div>
            )}

            {notifications.length === 0 && !isLoading && (
              <div className="py-8 text-center">
                <Bell className="w-10 h-10 mx-auto text-gray-300" />
                <p className="mt-2 text-sm text-gray-500">No notifications yet</p>
              </div>
            )}

            <ul className="divide-y divide-gray-100" role="list" aria-label="Notifications">
              {notifications.map(notification => (
                <li
                  key={notification.id}
                  onClick={() => handleNotificationClick(notification)}
                  className={`relative cursor-pointer px-4 py-3 transition-colors ${
                    notification.is_read
                      ? "bg-white hover:bg-gray-50"
                      : "bg-blue-50/50 hover:bg-blue-50"
                  }`}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === "Enter" && handleNotificationClick(notification)}
                >
                  <div className="flex items-start gap-3">
                    {/* Type indicator */}
                    <div
                      className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${
                        NOTIFICATION_TYPE_COLORS[notification.type as NotificationType] || "bg-gray-100 text-gray-600"
                      }`}
                    >
                      <Bell className="w-4 h-4" />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className={`text-sm font-medium ${notification.is_read ? "text-gray-900" : "text-gray-900 font-semibold"}`}>
                          {notification.title}
                        </p>
                        <span className="flex-shrink-0 text-xs text-gray-400 whitespace-nowrap">
                          {formatTimeAgo(notification.created_at)}
                        </span>
                      </div>
                      <p className={`mt-1 text-sm ${notification.is_read ? "text-gray-500" : "text-gray-700"}`}>
                        {notification.message}
                      </p>
                      <div className="mt-2 flex items-center gap-2">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                            NOTIFICATION_TYPE_COLORS[notification.type as NotificationType] || "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {NOTIFICATION_TYPE_LABELS[notification.type as NotificationType] || notification.type}
                        </span>
                        <span className="text-xs text-gray-400">
                          {NOTIFICATION_REF_TYPE_LABELS[notification.ref_type as NotificationRefType] || notification.ref_type}
                        </span>
                      </div>
                    </div>

                    {/* Unread indicator */}
                    {!notification.is_read && (
                      <div className="flex-shrink-0 w-2 h-2 mt-2 rounded-full bg-[var(--accent)]" />
                    )}

                    {/* Chevron */}
                    <ChevronRight className="flex-shrink-0 w-4 h-4 text-gray-300" />
                  </div>
                </li>
              ))}

              {hasMore && !isLoading && (
                <li className="py-4 text-center">
                  <button
                    type="button"
                    onClick={() => fetchNotifications(page + 1, true)}
                    className="text-sm text-[var(--accent)] hover:underline"
                  >
                    Load more
                  </button>
                </li>
              )}

              {isLoading && notifications.length > 0 && (
                <li className="py-4 text-center">
                  <div className="animate-spin rounded-full h-5 w-5 border-2 border-[var(--accent)] border-t-transparent mx-auto" />
                </li>
              )}
            </ul>
          </div>

          {/* Footer */}
          <div className="border-t border-gray-200 px-4 py-3">
            <a
              href="/notifications"
              className="block text-center text-sm font-medium text-[var(--accent)] hover:underline"
              onClick={(e) => {
                e.preventDefault();
                router.push("/notifications");
                setIsOpen(false);
              }}
            >
              View all notifications
            </a>
          </div>
        </div>
      )}
    </div>
  );
}