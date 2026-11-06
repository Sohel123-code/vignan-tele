import React from 'react';
export function Logo({compact=false}) {
  return <a href="/" className="brand" aria-label="VIIT AI Feedback home">
    <img src="/college-logo.jpg" alt="VIIT college logo" className="brand-logo" />
    {!compact && <span>VIIT<span className="brand-light"> AI Feedback</span><small>COLLEGE ADMINISTRATION</small></span>}
  </a>;
}
