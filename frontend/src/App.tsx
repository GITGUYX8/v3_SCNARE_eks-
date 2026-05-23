import { useState } from 'react';

export default function App() {
  const [labState, setLabState] = useState<'IDLE' | 'PROVISIONING' | 'RUNNING'>('IDLE');
  const [labUrl, setLabUrl] = useState<string>('');

  // Hardcoded for testing. Later, this comes from your actual login page!
  const studentId = 'yash-001'; 

  const handleStartLab = async () => {
    setLabState('PROVISIONING');

    try {
      // 1. Mock Login: Get the unforgeable JWT ID card
      const loginRes = await fetch('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId })
      });
      const { access_token } = await loginRes.json();

      // 2. Launch Infrastructure: Pass the JWT in the Authorization header
      const launchRes = await fetch('http://localhost:3000/api/labs/launch', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${access_token}`
        }
      });
      
      const launchData = await launchRes.json();

      if (launchRes.ok) {
        // Success! Save the path and update the UI
        setLabUrl(launchData.internalPath);
        setLabState('RUNNING');
      } else {
        alert('Failed to launch: ' + launchData.message);
        setLabState('IDLE');
      }
    } catch (error) {
      console.error(error);
      alert('Network error connecting to backend.');
      setLabState('IDLE');
    }
  };
  const handleStopLab = async () => {
    // 1. We need the token again to prove we have permission to destroy the lab
    // In a real app, you would save this token in localStorage or a Context provider
    const loginRes = await fetch('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId })
    });
    const { access_token } = await loginRes.json();

    try {
      // 2. Fire the DELETE request to your NestJS backend
      const stopRes = await fetch(`http://localhost:3000/api/labs/stop`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${access_token}`
        }
      });

      if (stopRes.ok) {
        // 3. Reset the UI back to the beginning
        setLabUrl('');
        setLabState('IDLE');
        alert('Hardware successfully destroyed.');
      } else {
        const errorData = await stopRes.json();
        alert('Failed to stop: ' + errorData.message);
      }
    } catch (error) {
      console.error(error);
      alert('Network error connecting to backend.');
    }
  };
  return (
    <div style={{ padding: '40px', fontFamily: 'sans-serif', maxWidth: '600px', margin: '0 auto' }}>
      <h1>ROS2 Cloud Labs</h1>
      <p>Welcome, {studentId}. Click below to provision your dedicated hardware.</p>

      {labState === 'IDLE' && (
        <button 
          onClick={handleStartLab}
          style={{ padding: '15px 30px', fontSize: '18px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}
        >
           Start ROS2 Environment
        </button>
      )}

      {labState === 'PROVISIONING' && (
        <div style={{ padding: '20px', backgroundColor: '#f3f4f6', borderRadius: '8px' }}>
          <h3> Provisioning Secure Sandbox...</h3>
          <p>Allocating CPU, RAM, and internal network routes. This takes about 15 seconds.</p>
        </div>
      )}

      {labState === 'RUNNING' && (
        <div style={{ padding: '20px', backgroundColor: '#d1fae5', borderRadius: '8px', border: '1px solid #10b981' }}>
          <h3 style={{ color: '#047857' }}>✅ Lab is Live!</h3>
          <p>Your isolated Kubernetes Pod is active.</p>
          <p><strong>Internal Routing Path:</strong> {labUrl}</p>
          
          {/* THE MAGIC WINDOW: This streams the local Kubernetes Ingress directly into the browser */}
          <iframe 
            src={`http://localhost${labUrl}`} 
            width="100%" 
            height="600px" 
            style={{ border: '2px solid #10b981', borderRadius: '8px', marginTop: '15px', backgroundColor: '#fff' }}
            title="ROS2 Workspace"
          />

          <button 
            style={{ padding: '10px 20px', marginTop: '10px', backgroundColor: '#ef4444', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', display: 'block' }}
            onClick={handleStopLab}
          >
            ⏹️ End Lab (Destroy Hardware)
          </button>
        </div>
      )}
    </div>
  );
}