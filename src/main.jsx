import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import './index.css'
import { ToastContainer, toast } from 'react-toastify'
import 'react-toastify/dist/ReactToastify.css'
import { AuthProvider } from './context/AuthContext'
import { playErrorSound, playWarnSound } from './lib/sounds'

// Global audio feedback: any toast.error anywhere in the app (validation
// failures, failed saves, rejected operations) plays the error sound; warnings
// play a softer tone. One hook covers every form in the application.
toast.onChange(payload => {
  if (payload.status !== 'added') return
  if (payload.type === 'error')   playErrorSound()
  if (payload.type === 'warning') playWarnSound()
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AuthProvider>
        <App />
        <ToastContainer
          position="bottom-right"
          autoClose={3500}
          hideProgressBar={false}
          newestOnTop
          closeOnClick
          pauseOnHover
        />
      </AuthProvider>
    </HashRouter>
  </React.StrictMode>
)
