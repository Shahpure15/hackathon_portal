import React, { useState, useEffect } from 'react';
import {
  Users,
  UserCheck,
  CalendarCheck,
  Award,
  Clock,
  AlertTriangle,
  AlertCircle,
  Info,
  CheckCircle2,
  ArrowRight,
  RefreshCw,
  Mail,
  ShieldCheck,
  PanelsTopLeft,
  ListChecks,
} from 'lucide-react';
import api from '../../services/api';
import './overview.css';

export default function OverviewModule({ onSelectTab }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const fetchOverview = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await api.get('/admin/overview');
      setData(res.data);
    } catch (err) {
      setError(err?.response?.data?.detail || 'Failed to load overview data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchOverview();
  }, []);

  const counts = data?.counts || {
    total_teams: 0,
    checked_in_teams: 0,
    total_judges: 0,
    active_rounds: 0,
    pending_evaluations: 0,
  };

  const attention = data?.attention || [];

  const checkinPercentage = counts.total_teams > 0
    ? Math.round((counts.checked_in_teams / counts.total_teams) * 100)
    : 0;

  return (
    <div className="overview-module">
      {/* Header */}
      <div className="overview-header">
        <div className="overview-title-group">
          <h1>Command Center Overview</h1>
          <p>Real-time status, health checks, and actionable operations</p>
        </div>
        <button
          type="button"
          className="overview-refresh-btn"
          onClick={() => fetchOverview(true)}
          disabled={loading || refreshing}
        >
          <RefreshCw size={14} className={refreshing ? 'spin-animation' : ''} />
          <span>{refreshing ? 'Refreshing...' : 'Refresh'}</span>
        </button>
      </div>

      {error && (
        <div className="overview-attention-card level-error">
          <div className="overview-attention-left">
            <AlertCircle size={20} className="overview-attention-icon" />
            <div className="overview-attention-content">
              <span className="overview-attention-item-title">Failed to load overview</span>
              <span className="overview-attention-desc">{error}</span>
            </div>
          </div>
          <button
            type="button"
            className="overview-attention-action-btn"
            onClick={() => fetchOverview()}
          >
            Retry
          </button>
        </div>
      )}

      {/* Key Metric Cards */}
      <div className="overview-metrics-grid">
        <div className="overview-metric-card">
          <div className="overview-metric-top">
            <span className="overview-metric-label">Total Teams</span>
            <div className="overview-metric-icon-wrap">
              <Users size={18} />
            </div>
          </div>
          <div className="overview-metric-value">{counts.total_teams}</div>
          <div className="overview-metric-sub">
            {counts.checked_in_teams} checked in ({checkinPercentage}%)
          </div>
          <div className="overview-metric-progress">
            <div
              className="overview-metric-progress-fill"
              style={{ width: `${checkinPercentage}%` }}
            />
          </div>
        </div>

        <div className="overview-metric-card">
          <div className="overview-metric-top">
            <span className="overview-metric-label">Checked-In</span>
            <div className="overview-metric-icon-wrap" style={{ background: '#ecfdf5', color: '#059669' }}>
              <UserCheck size={18} />
            </div>
          </div>
          <div className="overview-metric-value">{counts.checked_in_teams}</div>
          <div className="overview-metric-sub">
            Verified team attendance
          </div>
        </div>

        <div className="overview-metric-card">
          <div className="overview-metric-top">
            <span className="overview-metric-label">Judges Available</span>
            <div className="overview-metric-icon-wrap" style={{ background: '#f5f3ff', color: '#7c3aed' }}>
              <Award size={18} />
            </div>
          </div>
          <div className="overview-metric-value">{counts.total_judges}</div>
          <div className="overview-metric-sub">
            Staff assigned as judges
          </div>
        </div>

        <div className="overview-metric-card">
          <div className="overview-metric-top">
            <span className="overview-metric-label">Active Rounds</span>
            <div className="overview-metric-icon-wrap" style={{ background: '#eff6ff', color: '#2563eb' }}>
              <CalendarCheck size={18} />
            </div>
          </div>
          <div className="overview-metric-value">{counts.active_rounds}</div>
          <div className="overview-metric-sub">
            Live evaluation rounds
          </div>
        </div>

        <div className="overview-metric-card">
          <div className="overview-metric-top">
            <span className="overview-metric-label">Pending Scores</span>
            <div
              className="overview-metric-icon-wrap"
              style={{
                background: counts.pending_evaluations > 0 ? '#fef3c7' : '#ecfdf5',
                color: counts.pending_evaluations > 0 ? '#d97706' : '#059669',
              }}
            >
              <Clock size={18} />
            </div>
          </div>
          <div className="overview-metric-value">{counts.pending_evaluations}</div>
          <div className="overview-metric-sub">
            Awaiting judge submissions
          </div>
        </div>
      </div>

      {/* Attention List */}
      <div className="overview-section">
        <div className="overview-section-header">
          <h2 className="overview-section-title">
            <span>Needs Attention</span>
            {attention.length > 0 && (
              <span className="overview-attention-count-badge">
                {attention.length}
              </span>
            )}
          </h2>
        </div>

        {attention.length === 0 ? (
          <div className="overview-empty-attention">
            <CheckCircle2 size={36} className="overview-empty-icon" />
            <span className="overview-empty-title">All Systems Clear</span>
            <span className="overview-empty-sub">
              No failing emails, missing rubrics, or unassigned teams detected.
            </span>
          </div>
        ) : (
          <div className="overview-attention-grid">
            {attention.map((item) => {
              const isError = item.level === 'error';
              const isWarning = item.level === 'warning';
              const Icon = isError ? AlertCircle : isWarning ? AlertTriangle : Info;

              return (
                <div
                  key={item.id}
                  className={`overview-attention-card level-${item.level}`}
                >
                  <div className="overview-attention-left">
                    <Icon size={20} className="overview-attention-icon" />
                    <div className="overview-attention-content">
                      <div className="overview-attention-title-row">
                        <span className="overview-attention-item-title">
                          {item.title}
                        </span>
                        <span className="overview-attention-pill">
                          {item.level}
                        </span>
                      </div>
                      <span className="overview-attention-desc">
                        {item.description}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    className="overview-attention-action-btn"
                    onClick={() => onSelectTab && onSelectTab(item.action_module)}
                  >
                    <span>{item.action_label}</span>
                    <ArrowRight size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="overview-section">
        <div className="overview-section-header">
          <h2 className="overview-section-title">Quick Actions</h2>
        </div>
        <div className="overview-actions-grid">
          <button
            type="button"
            className="overview-action-card"
            onClick={() => onSelectTab && onSelectTab('evalRounds')}
          >
            <div className="overview-action-icon">
              <CalendarCheck size={18} />
            </div>
            <div>
              <div className="overview-action-title">Judging & Rounds</div>
              <div className="overview-action-sub">Manage rounds, rubrics & assignments</div>
            </div>
          </button>

          <button
            type="button"
            className="overview-action-card"
            onClick={() => onSelectTab && onSelectTab('email')}
          >
            <div className="overview-action-icon">
              <Mail size={18} />
            </div>
            <div>
              <div className="overview-action-title">Email Communications</div>
              <div className="overview-action-sub">Broadcast to teams or staff</div>
            </div>
          </button>

          <button
            type="button"
            className="overview-action-card"
            onClick={() => onSelectTab && onSelectTab('teams')}
          >
            <div className="overview-action-icon">
              <Users size={18} />
            </div>
            <div>
              <div className="overview-action-title">Teams & Checkpoints</div>
              <div className="overview-action-sub">Monitor teams, pods & attendance</div>
            </div>
          </button>

          <button
            type="button"
            className="overview-action-card"
            onClick={() => onSelectTab && onSelectTab('results')}
          >
            <div className="overview-action-icon">
              <Award size={18} />
            </div>
            <div>
              <div className="overview-action-title">Results & Advancement</div>
              <div className="overview-action-sub">Release leaderboard & progress teams</div>
            </div>
          </button>

          <button
            type="button"
            className="overview-action-card"
            onClick={() => onSelectTab && onSelectTab('roles')}
          >
            <div className="overview-action-icon">
              <ShieldCheck size={18} />
            </div>
            <div>
              <div className="overview-action-title">Roles & Access</div>
              <div className="overview-action-sub">Configure RBAC permissions</div>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
